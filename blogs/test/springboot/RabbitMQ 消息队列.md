---
title: RabbitMQ 消息队列
date: 2026-01-22
tags:
 - RabbitMQ 
 - Springboot
categories:
 - 项目实战
 - 练习
---

# RabbitMQ 消息队列在微服务中的应用实战

## 一、背景介绍

在微服务架构中,通知功能往往需要向多个用户发送消息。如果在业务主流程中同步发送通知，会导致以下问题：

1. **性能瓶颈**：批量发送通知会阻塞主流程，影响用户体验
2. **事务耦合**：通知失败可能导致主业务回滚
3. **扩展性差**：无法灵活应对通知量激增的场景

**解决方案**：引入 RabbitMQ 消息队列，将通知发送改为异步处理。

------

## 二、RabbitMQ 安装与配置

### 2.1 使用 Docker Compose 快速部署

创建 `docker-compose.yml` 文件：



```yaml
```yaml
version: '3.8'
services:
  rabbitmq:
    image: rabbitmq:3-management
    container_name: motorcycle-club-rabbitmq
    ports:
      - "5672:5672"    # AMQP 协议端口
      - "15672:15672"  # 管理界面端口
    environment:
      RABBITMQ_DEFAULT_USER: admin
      RABBITMQ_DEFAULT_PASS: 123456
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
    restart: unless-stopped
volumes:
  rabbitmq_data:
```



### 2.2 启动服务

```dockerfile
docker-compose up -d
```

验证服务状态：

```dockerfile
docker ps
# 应看到容器运行：motorcycle-club-rabbitmq
```

访问管理控制台：

- **地址**: [http://localhost:15672](http://localhost:15672/)
- **账号**: admin
- **密码**: 123456

------

## 三、Spring Boot 项目配置

### 3.1 添加 Maven 依赖

在 **父 POM** (`pom.xml`) 中统一管理版本：



```xml
<properties>
    <spring-amqp.version>3.1.0</spring-amqp.version>
</properties>

<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-amqp</artifactId>
            <version>${spring-amqp.version}</version>
        </dependency>
    </dependencies>
</dependencyManagement>
```

在 **子模块** (`core-service/pom.xml`) 中引入依赖：



```xml
<!-- RabbitMQ Spring Boot Starter -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-amqp</artifactId>
</dependency>
```

### 3.2 Nacos 配置中心统一配置

在 Nacos 创建配置文件 `rabbitmq-common.yml`（`DEFAULT_GROUP`）：



```yaml
spring:
  rabbitmq:
    host: 127.0.0.1
    port: 5672
    username: admin
    password: 123456
    virtual-host: /
    # 发送确认
    publisher-confirm-type: correlated
    publisher-returns: true
    # 消费者配置
    listener:
      simple:
        acknowledge-mode: manual  # 手动确认
        prefetch: 1
        retry:
          enabled: true
          max-attempts: 3
          initial-interval: 3000
          multiplier: 2
```

### 3.3 服务引入共享配置

修改 `core-service/src/main/resources/bootstrap.yml`：



```yaml
spring:
  application:
    name: core-service
  cloud:
    nacos:
      discovery:
        server-addr: 127.0.0.1:8848
      config:
        server-addr: 127.0.0.1:8848
        file-extension: yml
        # 引入共享配置
        shared-configs:
          - data-id: jwt-common.yml
            group: DEFAULT_GROUP
            refresh: true
          - data-id: rabbitmq-common.yml  # ✅ 新增
            group: DEFAULT_GROUP
            refresh: true
```

------

## 四、代码实现

### 4.1 消息模型定义

创建 `NotificationMessage.java`（用于消息传递）：



```java
// core-service/src/main/java/com/example/core/dto/NotificationMessage.java
package com.example.core.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.util.List;

/**
 * 通知消息 DTO
 * 用于 RabbitMQ 消息传递
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class NotificationMessage implements Serializable {
    private static final long serialVersionUID = 1L;

    /**
     * 单个用户ID (用于单条通知)
     */
    private Long userId;

    /**
     * 批量用户ID列表 (用于批量通知)
     */
    private List<Long> userIds;

    /**
     * 通知标题
     */
    private String title;

    /**
     * 通知内容
     */
    private String content;

    /**
     * 通知类型: SYSTEM, ACTIVITY, COURSE, NEWS
     */
    private String type;

    /**
     * 是否批量通知
     */
    private Boolean isBatch;

    /**
     * 创建单条通知消息
     */
    public static NotificationMessage single(Long userId, String title, 
                                             String content, String type) {
        NotificationMessage message = new NotificationMessage();
        message.setUserId(userId);
        message.setTitle(title);
        message.setContent(content);
        message.setType(type);
        message.setIsBatch(false);
        return message;
    }

    /**
     * 创建批量通知消息
     */
    public static NotificationMessage batch(List<Long> userIds, String title, 
                                            String content, String type) {
        NotificationMessage message = new NotificationMessage();
        message.setUserIds(userIds);
        message.setTitle(title);
        message.setContent(content);
        message.setType(type);
        message.setIsBatch(true);
        return message;
    }
}
```

------

### 4.2 RabbitMQ 配置类

创建 `RabbitMQConfig.java`：



```java
// core-service/src/main/java/com/example/core/config/RabbitMQConfig.java
package com.example.core.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.core.*;
import org.springframework.amqp.rabbit.config.SimpleRabbitListenerContainerFactory;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * RabbitMQ 配置类
 * 定义交换机、队列、绑定关系
 */
@Slf4j
@Configuration
public class RabbitMQConfig {

    // ========== 常量定义 ==========
    public static final String NOTIFICATION_EXCHANGE = "notification.topic.exchange";
    public static final String NOTIFICATION_QUEUE = "notification.queue";
    public static final String NOTIFICATION_ROUTING_KEY = "notification.#";

    // 死信队列
    public static final String NOTIFICATION_DLX_EXCHANGE = "notification.dlx.exchange";
    public static final String NOTIFICATION_DLX_QUEUE = "notification.dlx.queue";
    public static final String NOTIFICATION_DLX_ROUTING_KEY = "notification.dlx";

    // ========== 交换机 ==========

    /**
     * 主题交换机（支持通配符路由）
     */
    @Bean
    public TopicExchange notificationExchange() {
        return ExchangeBuilder
                .topicExchange(NOTIFICATION_EXCHANGE)
                .durable(true)
                .build();
    }

    /**
     * 死信交换机
     */
    @Bean
    public DirectExchange notificationDlxExchange() {
        return ExchangeBuilder
                .directExchange(NOTIFICATION_DLX_EXCHANGE)
                .durable(true)
                .build();
    }

    // ========== 队列 ==========

    /**
     * 通知队列（配置死信队列）
     */
    @Bean
    public Queue notificationQueue() {
        return QueueBuilder
                .durable(NOTIFICATION_QUEUE)
                .deadLetterExchange(NOTIFICATION_DLX_EXCHANGE)
                .deadLetterRoutingKey(NOTIFICATION_DLX_ROUTING_KEY)
                .ttl(1800000)  // 30分钟
                .build();
    }

    /**
     * 死信队列
     */
    @Bean
    public Queue notificationDlxQueue() {
        return QueueBuilder
                .durable(NOTIFICATION_DLX_QUEUE)
                .build();
    }

    // ========== 绑定关系 ==========

    @Bean
    public Binding notificationBinding() {
        return BindingBuilder
                .bind(notificationQueue())
                .to(notificationExchange())
                .with(NOTIFICATION_ROUTING_KEY);
    }

    @Bean
    public Binding notificationDlxBinding() {
        return BindingBuilder
                .bind(notificationDlxQueue())
                .to(notificationDlxExchange())
                .with(NOTIFICATION_DLX_ROUTING_KEY);
    }

    // ========== RabbitTemplate ==========

    @Bean
    public RabbitTemplate rabbitTemplate(ConnectionFactory connectionFactory) {
        RabbitTemplate template = new RabbitTemplate(connectionFactory);
        template.setMessageConverter(new Jackson2JsonMessageConverter());

        template.setConfirmCallback((correlationData, ack, cause) -> {
            if (ack) {
                log.debug("✅ 消息发送成功: {}", correlationData);
            } else {
                log.error("❌ 消息发送失败: {}, 原因: {}", correlationData, cause);
            }
        });

        template.setReturnsCallback(returned -> {
            log.error("❌ 消息被退回: exchange={}, routingKey={}, message={}",
                    returned.getExchange(),
                    returned.getRoutingKey(),
                    returned.getMessage());
        });

        return template;
    }

    @Bean
    public SimpleRabbitListenerContainerFactory rabbitListenerContainerFactory(
            ConnectionFactory connectionFactory) {
        SimpleRabbitListenerContainerFactory factory = 
            new SimpleRabbitListenerContainerFactory();
        factory.setConnectionFactory(connectionFactory);
        factory.setMessageConverter(new Jackson2JsonMessageConverter());
        return factory;
    }
}
```

### 4.3 消息生产者（Producer）

创建 `NotificationProducer.java`：



```java
// core-service/src/main/java/com/example/core/mq/NotificationProducer.java
package com.example.core.mq;

import com.example.core.config.RabbitMQConfig;
import com.example.core.dto.NotificationMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.connection.CorrelationData;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;

/**
 * 通知消息生产者（异步发送）
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class NotificationProducer {

    private final RabbitTemplate rabbitTemplate;

    /**
     * 发送单条通知（异步）
     */
    public void sendNotification(Long userId, String title, String content, String type) {
        try {
            NotificationMessage message = NotificationMessage.single(userId, title, content, type);
            String messageId = UUID.randomUUID().toString();
            CorrelationData correlationData = new CorrelationData(messageId);

            correlationData.getFuture().addCallback(
                result -> {
                    if (result != null && result.isAck()) {
                        log.info("✅ [MQ] 发送单条通知成功: userId={}, title={}, msgId={}",
                                userId, title, messageId);
                    } else {
                        log.error("❌ [MQ] 发送单条通知失败: userId={}, title={}",
                                userId, title);
                    }
                },
                ex -> log.error("❌ [MQ] 发送单条通知异常: userId={}, title={}",
                        userId, title, ex)
            );

            rabbitTemplate.convertAndSend(
                    RabbitMQConfig.NOTIFICATION_EXCHANGE,
                    "notification.single",
                    message,
                    correlationData
            );

            log.debug("📤 [MQ] 已提交单条通知发送任务: userId={}, title={}", userId, title);

        } catch (Exception e) {
            log.error("❌ [MQ] 提交单条通知发送任务失败: userId={}", userId, e);
        }
    }

    /**
     * 批量发送通知（异步）
     */
    public void batchSendNotifications(List<Long> userIds, String title, String content, String type) {
        if (userIds == null || userIds.isEmpty()) {
            log.warn("⚠️ [MQ] 批量发送通知跳过：用户ID列表为空");
            return;
        }

        try {
            NotificationMessage message = NotificationMessage.batch(userIds, title, content, type);
            String messageId = UUID.randomUUID().toString();
            CorrelationData correlationData = new CorrelationData(messageId);

            correlationData.getFuture().addCallback(
                result -> {
                    if (result != null && result.isAck()) {
                        log.info("✅ [MQ] 批量发送通知成功: count={}, title={}, msgId={}",
                                userIds.size(), title, messageId);
                    } else {
                        log.error("❌ [MQ] 批量发送通知失败: count={}, title={}",
                                userIds.size(), title);
                    }
                },
                ex -> log.error("❌ [MQ] 批量发送通知异常: count={}, title={}",
                        userIds.size(), title, ex)
            );

            rabbitTemplate.convertAndSend(
                    RabbitMQConfig.NOTIFICATION_EXCHANGE,
                    "notification.batch",
                    message,
                    correlationData
            );

            log.info("📤 [MQ] 已提交批量通知发送任务: count={}, title={}", userIds.size(), title);

        } catch (Exception e) {
            log.error("❌ [MQ] 提交批量通知发送任务失败: count={}", userIds.size(), e);
        }
    }
}
```



### 4.4 消息消费者（Consumer）

创建 `NotificationListener.java`：



```java
// core-service/src/main/java/com/example/core/listener/NotificationListener.java
package com.example.core.listener;

import com.example.core.config.RabbitMQConfig;
import com.example.core.controller.NotificationController;
import com.example.core.dto.NotificationDTO;
import com.example.core.dto.NotificationMessage;
import com.example.core.entity.Notification;
import com.example.core.service.NotificationService;
import com.rabbitmq.client.Channel;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.beans.BeanUtils;
import org.springframework.context.ApplicationContext;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/**
 * RabbitMQ 消息监听器 - 消费通知消息
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class NotificationListener {

    private final NotificationService notificationService;
    private final ApplicationContext applicationContext;

    @RabbitListener(queues = RabbitMQConfig.NOTIFICATION_QUEUE, ackMode = "MANUAL")
    public void handleNotification(NotificationMessage notificationMessage,
                                   Message message,
                                   Channel channel) throws IOException {
        long deliveryTag = message.getMessageProperties().getDeliveryTag();

        try {
            log.info("📨 收到通知消息: {}", notificationMessage);

            if (Boolean.TRUE.equals(notificationMessage.getIsBatch())) {
                handleBatchNotification(notificationMessage);
            } else {
                handleSingleNotification(notificationMessage);
            }
            // ✅ 手动确认消息
            channel.basicAck(deliveryTag, false);
            log.info("✅ 通知消息处理成功");

        } catch (Exception e) {
            log.error("❌ 通知消息处理失败", e);

            // 重试逻辑
            Integer retryCount = getRetryCount(message);
            if (retryCount < 3) {
                log.warn("⚠️ 消息重新入队，当前重试次数: {}", retryCount + 1);
                message.getMessageProperties().setHeader("x-retry-count", retryCount + 1);
                channel.basicNack(deliveryTag, false, true);  // requeue = true
            } else {
                log.error("💀 消息重试次数超限，进入死信队列");
                channel.basicNack(deliveryTag, false, false);  // requeue = false
            }
        }
    }

    /**
     * 处理单个用户通知
     */
    private void handleSingleNotification(NotificationMessage msg) {
        // 1️⃣ 保存到数据库
        Notification notification = new Notification();
        notification.setUserId(msg.getUserId());
        notification.setTitle(msg.getTitle());
        notification.setContent(msg.getContent());
        notification.setType(msg.getType());
        notification.setIsRead(false);
        notificationService.save(notification);

        // 2️⃣ 推送给在线用户（SSE）
        try {
            NotificationController controller =
                    applicationContext.getBean(NotificationController.class);
            controller.sendToUser(msg.getUserId(), toDTO(notification));
        } catch (Exception e) {
            log.warn("⚠️ SSE 推送失败（用户可能离线）: userId={}", msg.getUserId());
        }

        log.info("✅ 单个通知处理完成: userId={}, title={}", msg.getUserId(), msg.getTitle());
    }

    /**
     * 处理批量通知
     */
    private void handleBatchNotification(NotificationMessage msg) {
        List<Long> userIds = msg.getUserIds();
        if (userIds == null || userIds.isEmpty()) {
            log.warn("⚠️ 批量通知用户列表为空");
            return;
        }

        // 1️⃣ 批量保存到数据库
        List<Notification> notifications = new ArrayList<>();
        for (Long userId : userIds) {
            Notification notification = new Notification();
            notification.setUserId(userId);
            notification.setTitle(msg.getTitle());
            notification.setContent(msg.getContent());
            notification.setType(msg.getType());
            notification.setIsRead(false);
            notifications.add(notification);
        }
        notificationService.saveBatch(notifications);

        // 2️⃣ 推送给在线用户（SSE）
        try {
            NotificationController controller =
                    applicationContext.getBean(NotificationController.class);
            for (Notification notification : notifications) {
                try {
                    controller.sendToUser(notification.getUserId(), toDTO(notification));
                } catch (Exception e) {
                    log.debug("用户 {} 离线，跳过 SSE 推送", notification.getUserId());
                }
            }
        } catch (Exception e) {
            log.warn("⚠️ 批量 SSE 推送部分失败: {}", e.getMessage());
        }

        log.info("✅ 批量通知处理完成: {} 位用户, title={}", userIds.size(), msg.getTitle());
    }

    /**
     * 获取消息重试次数
     */
    private Integer getRetryCount(Message message) {
        Object header = message.getMessageProperties().getHeader("x-retry-count");
        if (header instanceof Integer) {
            return (Integer) header;
        } else if (header instanceof Long) {
            return ((Long) header).intValue();
        }
        return 0;
    }

    /**
     * Entity 转 DTO
     */
    private NotificationDTO toDTO(Notification notification) {
        NotificationDTO dto = new NotificationDTO();
        BeanUtils.copyProperties(notification, dto);
        return dto;
    }
}
```

### 4.5 死信队列监听器

创建 `NotificationDlxListener.java`：



```java
// core-service/src/main/java/com/example/core/listener/NotificationDlxListener.java
package com.example.core.listener;

import com.example.core.config.RabbitMQConfig;
import com.example.core.dto.NotificationMessage;
import com.rabbitmq.client.Channel;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * 死信队列监听器 - 处理失败消息
 */
@Slf4j
@Component
public class NotificationDlxListener {

    @RabbitListener(queues = RabbitMQConfig.NOTIFICATION_DLX_QUEUE, ackMode = "MANUAL")
    public void handleDeadLetter(NotificationMessage notificationMessage,
                                 Message message,
                                 Channel channel) throws IOException {
        long deliveryTag = message.getMessageProperties().getDeliveryTag();

        try {
            log.error("💀 死信队列收到消息: {}", notificationMessage);

            // TODO: 可以执行以下操作
            // 1. 发送告警邮件给运维
            // 2. 记录到专门的失败日志表
            // 3. 推送到监控系统（如 Prometheus）
            // 4. 人工介入处理

            // ✅ 确认消息
            channel.basicAck(deliveryTag, false);

        } catch (Exception e) {
            log.error("❌ 死信消息处理失败", e);
            channel.basicNack(deliveryTag, false, false);
        }
    }
}
```

------

### 4.6 NotificationService 接口（支持异步调用）

修改 `NotificationService.java`：



```java
package com.example.core.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.example.core.dto.NotificationDTO;
import com.example.core.entity.Notification;
import com.github.pagehelper.PageInfo;

import java.util.List;

public interface NotificationService extends IService<Notification> {

    /**
     * 分页查询用户通知
     */
    PageInfo<NotificationDTO> pageNotifications(Long userId, int page, int pageSize);

    /**
     * 标记通知为已读
     */
    void markAsRead(Long notificationId);

    /**
     * 批量标记为已读
     */
    void batchMarkAsRead(List<Long> notificationIds);

    /**
     * 获取未读通知数量
     */
    Long getUnreadCount(Long userId);

    /**
     * ✅ 异步发送单条通知（通过 RabbitMQ）
     */
    void sendNotificationAsync(Long userId, String title, String content, String type);

    /**
     * ✅ 异步批量发送通知（通过 RabbitMQ）
     */
    void batchSendNotificationsAsync(List<Long> userIds, String title, String content, String type);

    /**
     * ⚠️ 同步发送通知（直接保存数据库，用于消费者内部调用）
     */
    void sendNotification(Long userId, String title, String content, String type);

    /**
     * ⚠️ 同步批量发送通知（直接保存数据库，用于消费者内部调用）
     */
    void batchSendNotifications(List<Long> userIds, String title, String content, String type);
}
```

------

### 4.7 NotificationService 实现类

修改 `NotificationServiceImpl.java`：



```java
package com.example.core.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.example.core.dto.NotificationDTO;
import com.example.core.entity.Notification;
import com.example.core.mapper.NotificationMapper;
import com.example.core.mq.NotificationProducer;
import com.example.core.service.NotificationService;
import com.github.pagehelper.PageHelper;
import com.github.pagehelper.PageInfo;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationServiceImpl extends ServiceImpl<NotificationMapper, Notification>
        implements NotificationService {

    private final NotificationMapper notificationMapper;
    private final NotificationProducer notificationProducer;

    @Override
    public PageInfo<NotificationDTO> pageNotifications(Long userId, int page, int pageSize) {
        PageHelper.startPage(page, pageSize);
        List<Notification> list = this.lambdaQuery()
                .eq(Notification::getUserId, userId)
                .orderByDesc(Notification::getCreateTime)
                .list();
        PageInfo<Notification> pageInfo = new PageInfo<>(list);
        
        List<NotificationDTO> dtoList = list.stream()
                .map(this::toDTO)
                .collect(Collectors.toList());
        
        PageInfo<NotificationDTO> result = new PageInfo<>();
        BeanUtils.copyProperties(pageInfo, result);
        result.setList(dtoList);
        return result;
    }

    @Override
    public void markAsRead(Long notificationId) {
        Notification notification = this.getById(notificationId);
        if (notification != null) {
            notification.setIsRead(true);
            this.updateById(notification);
        }
    }

    @Override
    public void batchMarkAsRead(List<Long> notificationIds) {
        if (notificationIds != null && !notificationIds.isEmpty()) {
            this.lambdaUpdate()
                    .in(Notification::getId, notificationIds)
                    .set(Notification::getIsRead, true)
                    .update();
        }
    }

    @Override
    public Long getUnreadCount(Long userId) {
        return this.lambdaQuery()
                .eq(Notification::getUserId, userId)
                .eq(Notification::getIsRead, false)
                .count();
    }

    // ========== 异步方法（发送到 MQ）==========

    @Override
    public void sendNotificationAsync(Long userId, String title, String content, String type) {
        notificationProducer.sendNotification(userId, title, content, type);
    }

    @Override
    public void batchSendNotificationsAsync(List<Long> userIds, String title, String content, String type) {
        notificationProducer.batchSendNotifications(userIds, title, content, type);
    }

    // ========== 同步方法（直接保存，仅供消费者调用）==========

    @Override
    public void sendNotification(Long userId, String title, String content, String type) {
        Notification notification = new Notification();
        notification.setUserId(userId);
        notification.setTitle(title);
        notification.setContent(content);
        notification.setType(type);
        notification.setIsRead(false);
        this.save(notification);
    }

    @Override
    public void batchSendNotifications(List<Long> userIds, String title, String content, String type) {
        List<Notification> notifications = userIds.stream()
                .map(userId -> {
                    Notification notification = new Notification();
                    notification.setUserId(userId);
                    notification.setTitle(title);
                    notification.setContent(content);
                    notification.setType(type);
                    notification.setIsRead(false);
                    return notification;
                })
                .collect(Collectors.toList());
        this.saveBatch(notifications);
    }

    private NotificationDTO toDTO(Notification notification) {
        NotificationDTO dto = new NotificationDTO();
        BeanUtils.copyProperties(notification, dto);
        return dto;
    }
}
```

------

### 4.8 业务层改造示例

**活动报名通知管理员**：



```java
// ActivityEnrollmentServiceImpl.java (部分代码)
@Override
@Transactional(rollbackFor = Exception.class)
public HttpResult<String> enrollActivity(ActivityEnrollmentDTO dto) {
    // ... 保存报名记录 ...

    // ✅ 异步通知所有管理员审核
    try {
        List<Long> adminIds = getAllAdminUserIds();
        if (!adminIds.isEmpty()) {
            notificationService.batchSendNotificationsAsync(
                    adminIds,
                    "新的活动报名",
                    String.format("%s 报名了活动【%s】，请及时审核",
                            dto.getMemberName(), activity.getActivityName()),
                    "ACTIVITY"
            );
            log.info("✅ 已提交通知任务: {} 位管理员", adminIds.size());
        }
    } catch (Exception e) {
        log.error("❌ 提交通知任务失败（不影响业务）", e);
    }

    return HttpResult.ok("报名成功，请等待审核");
}
```

**活动发布通知所有会员**：



```java
// ActivityServiceImpl.java (部分代码)
@Override
@Transactional(rollbackFor = Exception.class)
public HttpResult<String> addActivity(ActivityDTO dto) {
    // ... 保存活动 ...

    // ✅ 异步通知所有会员
    try {
        List<Long> memberUserIds = memberService.list()
                .stream()
                .map(Member::getUserId)
                .toList();
        
        if (!memberUserIds.isEmpty()) {
            notificationService.batchSendNotificationsAsync(
                    memberUserIds,
                    "新活动发布通知",
                    String.format("新活动【%s】已发布！", activity.getActivityName()),
                    "ACTIVITY"
            );
            log.info("✅ 已提交通知任务: {} 位会员", memberUserIds.size());
        }
    } catch (Exception e) {
        log.error("❌ 提交活动通知任务失败", e);
    }

    return HttpResult.ok("新增成功");
}
```

------

## 五、核心优势总结

| 改造前（同步）               | 改造后（异步 MQ）            |
| :--------------------------- | :--------------------------- |
| 主流程阻塞，等待通知发送完成 | 主流程立即返回，通知异步处理 |
| 批量通知可能拖慢响应时间     | 通知发送不影响主业务性能     |
| 通知失败可能导致事务回滚     | 通知失败不影响主业务成功     |
| 通知逻辑耦合在业务代码中     | 生产者/消费者解耦，易维护    |

------

## 六、验证与监控

### 6.1 访问 RabbitMQ 管理界面

[http://localhost:15672](http://localhost:15672/)

- 查看 **Queues** 标签，确认队列创建成功
- 查看 **Message rates**，监控消息流转速度

### 6.2 查看消息发送日志

```
📤 [MQ] 已提交批量通知发送任务: count=5, title=新活动发布通知✅ [MQ] 批量发送通知成功: count=5, title=新活动发布通知, msgId=xxx
```

### 6.3 查看消息消费日志

```
📨 收到通知消息: NotificationMessage(userId=null, userIds=[1,2,3,4,5], ...)✅ 批量通知处理完成: 5 位用户, title=新活动发布通知
```

### 6.4 死信队列监控

如果消息处理失败超过 3 次：

```
💀 死信队列收到消息: NotificationMessage(...)
```