---
title: Kafka 消息队列
date: 2026-01-21
tags:
 - Kafka  
 - Springboot
categories:
 - 项目实战
 - 练习
---

# Kafka 消息队列在微服务中的应用实战

## 一、背景介绍

在微服务架构中,通知功能往往需要向多个用户发送消息。如果在业务主流程中同步发送通知，会导致以下问题：

1. **性能瓶颈**：批量发送通知会阻塞主流程，影响用户体验
2. **事务耦合**：通知失败可能导致主业务回滚
3. **扩展性差**：无法灵活应对通知量激增的场景

**解决方案**：引入 Kafka 消息队列，将通知发送改为异步处理。

------

## 二、Kafka 安装与配置

### 2.1 使用 Docker Compose 快速部署

创建 `docker-compose.yml` 文件：

```yaml
# Nacos 配置：kafka-common.yml
spring:
  kafka:
    bootstrap-servers: localhost:9092
    producer:
      key-serializer: org.apache.kafka.common.serialization.StringSerializer
      value-serializer: org.springframework.kafka.support.serializer.JsonSerializer
      acks: all
      retries: 3
      batch-size: 16384
      linger-ms: 1
      buffer-memory: 33554432
    consumer:
      key-deserializer: org.apache.kafka.common.serialization.StringDeserializer
      value-deserializer: org.springframework.kafka.support.serializer.JsonDeserializer
      group-id: motorcycle-club-group
      auto-offset-reset: earliest
      enable-auto-commit: false
      properties:
        spring.json.trusted.packages: "*"
    listener:
      ack-mode: manual

# Kafka Topic 配置
kafka:
  topics:
    notification: notification-topic
    member: member-topic
    activity: activity-topic
    news: news-topic
    course: course-topic
```

### 2.2 启动服务

```dockerfile
docker-compose up -d
```

验证服务状态：

```dockerfile
docker ps
# 应看到两个容器运行：motorcycle-club-zookeeper 和 motorcycle-club-kafka
```

## 三、Spring Boot 项目配置

### 3.1 添加 Maven 依赖

在 **父 POM** (`pom.xml`) 中统一管理版本：

```xml
<properties>
    <spring-kafka.version>3.1.2</spring-kafka.version>
</properties>

<dependencyManagement>
    <dependencies>
        <!-- Kafka 消息队列 -->
        <dependency>
            <groupId>org.springframework.kafka</groupId>
            <artifactId>spring-kafka</artifactId>
            <version>${spring-kafka.version}</version>
        </dependency>
    </dependencies>
</dependencyManagement>
```

在 **子模块** (`core-service/pom.xml`) 中引入依赖：



```xml
<!-- Kafka -->
<dependency>
    <groupId>org.springframework.kafka</groupId>
    <artifactId>spring-kafka</artifactId>
</dependency>
```

### 3.2 Nacos 配置中心统一配置

在 Nacos 创建配置文件 `kafka-common.yml`（`DEFAULT_GROUP`）：

```yaml
# Nacos 配置：kafka-common.yml
spring:
  kafka:
    bootstrap-servers: localhost:9092
    producer:
      key-serializer: org.apache.kafka.common.serialization.StringSerializer
      value-serializer: org.springframework.kafka.support.serializer.JsonSerializer
      acks: all
      retries: 3
      batch-size: 16384
      linger-ms: 1
      buffer-memory: 33554432
    consumer:
      key-deserializer: org.apache.kafka.common.serialization.StringDeserializer
      value-deserializer: org.springframework.kafka.support.serializer.JsonDeserializer
      group-id: motorcycle-club-group
      auto-offset-reset: earliest
      enable-auto-commit: false
      properties:
        spring.json.trusted.packages: "*"
    listener:
      ack-mode: manual

# Kafka Topic 配置
kafka:
  topics:
    notification: notification-topic
    member: member-topic
    activity: activity-topic
    news: news-topic
    course: course-topic
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
          - data-id: kafka-common.yml  # ✅ 新增
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
 * Kafka 通知消息 DTO
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class NotificationMessage implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 单个用户 ID
     */
    private Long userId;

    /**
     * 批量用户 ID
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
     * 是否批量
     */
    private Boolean isBatch;

    // ========== 便捷构造方法 ==========

    /**
     * 创建单条通知消息
     */
    public static NotificationMessage single(Long userId, String title, 
                                             String content, String type) {
        NotificationMessage msg = new NotificationMessage();
        msg.setUserId(userId);
        msg.setTitle(title);
        msg.setContent(content);
        msg.setType(type);
        msg.setIsBatch(false);
        return msg;
    }

    /**
     * 创建批量通知消息
     */
    public static NotificationMessage batch(List<Long> userIds, String title, 
                                            String content, String type) {
        NotificationMessage msg = new NotificationMessage();
        msg.setUserIds(userIds);
        msg.setTitle(title);
        msg.setContent(content);
        msg.setType(type);
        msg.setIsBatch(true);
        return msg;
    }
}
```

------

### 4.2 Kafka 配置类

创建 `KafkaConfig.java`：

```java
// core-service/src/main/java/com/example/core/config/KafkaConfig.java
package com.example.core.config;

import org.springframework.context.annotation.Configuration;

/**
 * Kafka 配置类
 */
@Configuration
public class KafkaConfig {

    /**
     * 通知主题名称
     */
    public static final String NOTIFICATION_TOPIC = "notification-topic";
}
```

------

### 4.3 消息生产者（Producer）

创建 `NotificationProducer.java`：

```java
// core-service/src/main/java/com/example/core/mq/NotificationProducer.java
package com.example.core.mq;

import com.example.core.config.KafkaConfig;
import com.example.core.dto.NotificationMessage;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.concurrent.CompletableFuture;

/**
 * 通知消息生产者（异步发送）
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class NotificationProducer {

    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * 发送单条通知（异步）
     */
    public void sendNotification(Long userId, String title, String content, String type) {
        try {
            NotificationMessage message = NotificationMessage.single(userId, title, content, type);
            String json = objectMapper.writeValueAsString(message);

            CompletableFuture<SendResult<String, String>> future = 
                kafkaTemplate.send(KafkaConfig.NOTIFICATION_TOPIC, json);

            future.whenComplete((result, ex) -> {
                if (ex == null) {
                    log.info("✅ [Kafka] 发送单条通知成功: userId={}, title={}, offset={}",
                            userId, title, result.getRecordMetadata().offset());
                } else {
                    log.error("❌ [Kafka] 发送单条通知失败: userId={}, title={}",
                            userId, title, ex);
                }
            });

            log.debug("📤 [Kafka] 已提交单条通知发送任务: userId={}, title={}", userId, title);

        } catch (Exception e) {
            log.error("❌ [Kafka] 提交单条通知发送任务失败: userId={}", userId, e);
        }
    }

    /**
     * 批量发送通知（异步）
     */
    public void batchSendNotifications(List<Long> userIds, String title, String content, String type) {
        if (userIds == null || userIds.isEmpty()) {
            log.warn("⚠️ [Kafka] 批量发送通知跳过：用户ID列表为空");
            return;
        }

        try {
            NotificationMessage message = NotificationMessage.batch(userIds, title, content, type);
            String json = objectMapper.writeValueAsString(message);

            CompletableFuture<SendResult<String, String>> future = 
                kafkaTemplate.send(KafkaConfig.NOTIFICATION_TOPIC, json);

            future.whenComplete((result, ex) -> {
                if (ex == null) {
                    log.info("✅ [Kafka] 批量发送通知成功: count={}, title={}, offset={}",
                            userIds.size(), title, result.getRecordMetadata().offset());
                } else {
                    log.error("❌ [Kafka] 批量发送通知失败: count={}, title={}",
                            userIds.size(), title, ex);
                }
            });

            log.info("📤 [Kafka] 已提交批量通知发送任务: count={}, title={}", userIds.size(), title);

        } catch (Exception e) {
            log.error("❌ [Kafka] 提交批量通知发送任务失败: count={}", userIds.size(), e);
        }
    }
}
```

------

### 4.4 消息消费者（Consumer）

创建 `NotificationKafkaListener.java`：

```java
// core-service/src/main/java/com/example/core/listener/NotificationKafkaListener.java
package com.example.core.listener;

import com.example.core.config.KafkaConfig;
import com.example.core.controller.NotificationController;
import com.example.core.dto.NotificationDTO;
import com.example.core.dto.NotificationMessage;
import com.example.core.entity.Notification;
import com.example.core.service.NotificationService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.context.ApplicationContext;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * Kafka 通知消息监听器
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class NotificationKafkaListener {

    private final NotificationService notificationService;
    private final ApplicationContext applicationContext;
    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * 监听通知主题
     */
    @KafkaListener(
            topics = KafkaConfig.NOTIFICATION_TOPIC,
            groupId = "notification-group"
    )
    public void handleNotification(String message, Acknowledgment acknowledgment) {
        try {
            log.info("📨 收到 Kafka 通知消息: {}", message);

            // 反序列化消息
            NotificationMessage notificationMessage = objectMapper.readValue(
                    message,
                    NotificationMessage.class
            );

            // 根据类型处理
            if (Boolean.TRUE.equals(notificationMessage.getIsBatch())) {
                handleBatchNotification(notificationMessage);
            } else {
                handleSingleNotification(notificationMessage);
            }

            // ✅ 手动提交偏移量
            acknowledgment.acknowledge();
            log.info("✅ Kafka 通知消息处理成功");

        } catch (Exception e) {
            log.error("❌ Kafka 通知消息处理失败", e);
            // Kafka 会自动重试（根据配置）
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

        // 2️⃣ SSE 推送
        try {
            NotificationController controller =
                    applicationContext.getBean(NotificationController.class);
            controller.sendToUser(msg.getUserId(), toDTO(notification));
        } catch (Exception e) {
            log.debug("用户 {} 离线，跳过 SSE 推送", msg.getUserId());
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

        // 2️⃣ SSE 推送
        try {
            NotificationController controller =
                    applicationContext.getBean(NotificationController.class);
            for (Notification notification : notifications) {
                try {
                    controller.sendToUser(notification.getUserId(), toDTO(notification));
                } catch (Exception e) {
                    log.debug("用户 {} 离线，跳过推送", notification.getUserId());
                }
            }
        } catch (Exception e) {
            log.warn("⚠️ 批量 SSE 推送部分失败: {}", e.getMessage());
        }

        log.info("✅ 批量通知处理完成: {} 位用户, title={}", userIds.size(), msg.getTitle());
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

------

### 4.5 业务层改造示例

**活动发布通知所有会员**（`ActivityServiceImpl.java`）：

```java
@Override
@Transactional(rollbackFor = Exception.class)
public HttpResult<String> addActivity(ActivityDTO dto) {
    validateActivityDTO(dto);

    Activity activity = convertToEntity(dto);
    activity.setCurrentParticipants(0);

    boolean success = this.save(activity);
    if (!success) {
        return HttpResult.error(500, "新增活动失败");
    }

    // ✅ 发送通知（通过 Kafka）
    try {
        List<Long> memberUserIds = memberService.list().stream()
                .map(Member::getUserId)
                .toList();
        if (!memberUserIds.isEmpty()) {
            Map<String, Object> message = new HashMap<>();
            message.put("userIds", memberUserIds);
            message.put("title", "新活动发布通知");
            message.put("content", String.format("新活动【%s】已发布！", activity.getActivityName()));
            message.put("type", "ACTIVITY");
            message.put("isBatch", true);
            String json = objectMapper.writeValueAsString(message);
            kafkaTemplate.send("notification-topic", json);
            log.info("✅ 已发送活动通知: {} 位会员", memberUserIds.size());
        }
    } catch (Exception e) {
        log.error("❌ 发送活动通知失败", e);
    }
    return HttpResult.ok("新增成功");
}
```

**课程发布通知所有会员**（`CourseServiceImpl.java`）：

```java
/**
 * 通知所有会员新课程上线
 */
private void notifyMembersAboutNewCourse(Course course) {
    try {
        List<Long> memberUserIds = memberService.list().stream()
                .map(Member::getUserId)
                .toList();

        if (!memberUserIds.isEmpty()) {
            Map<String, Object> message = new HashMap<>();
            message.put("userIds", memberUserIds);
            message.put("title", "新课程上线通知");
            message.put("content", String.format(
                    "新课程【%s】已上线！%s，%s",
                    course.getCourseName(),
                    course.getCategory(),
                    course.getOnline() ? "线上授课" : "线下实操"
            ));
            message.put("type", "COURSE");
            message.put("isBatch", true);

            String json = objectMapper.writeValueAsString(message);
            kafkaTemplate.send("notification-topic", json);
            log.info("✅ 已通过 Kafka 通知 {} 位会员新课程上线", memberUserIds.size());
        }
    } catch (Exception e) {
        log.error("❌ 发送课程通知失败", e);
    }
}
```

------

### 4.6 NotificationService 接口（支持异步调用）

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
     * ✅ 异步发送单条通知（通过 Kafka）
     */
    void sendNotificationAsync(Long userId, String title, String content, String type);

    /**
     * ✅ 异步批量发送通知（通过 Kafka）
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

    // ========== 异步方法（发送到 Kafka）==========

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

## 五、核心优势总结

| 改造前（同步）               | 改造后（异步 Kafka）         |
| :--------------------------- | :--------------------------- |
| 主流程阻塞，等待通知发送完成 | 主流程立即返回，通知异步处理 |
| 批量通知可能拖慢响应时间     | 通知发送不影响主业务性能     |
| 通知失败可能导致事务回滚     | 通知失败不影响主业务成功     |
| 通知逻辑耦合在业务代码中     | 生产者/消费者解耦，易维护    |
| 无法应对流量激增             | 支持水平扩展消费者实例       |

------

## 六、验证与监控

### 6.1 查看 Kafka Topic 信息

```dockerfile
# 查看 Topic 详情
kafka-topics --describe \
  --bootstrap-server localhost:9092 \
  --topic notification-topic

# 查看消费者组状态
kafka-consumer-groups --describe \
  --bootstrap-server localhost:9092 \
  --group notification-group
```

### 6.2 查看消息发送日志

```
📤 [Kafka] 已提交批量通知发送任务: count=5, title=新活动发布通知
✅ [Kafka] 批量发送通知成功: count=5, title=新活动发布通知, offset=123
```

### 6.3 查看消息消费日志

```
📨 收到 Kafka 通知消息: {"userIds":[1,2,3,4,5],"title":"新活动发布通知",...}
✅ 批量通知处理完成: 5 位用户, title=新活动发布通知
```

### 6.4 Kafka 监控工具

推荐使用 **Kafka Manager** 或 **Confluent Control Center** 监控：

```yaml
# docker-compose.yml 添加 Kafka Manager
kafka-manager:
  image: hlebalbau/kafka-manager:latest
  container_name: kafka-manager
  ports:
    - "9000:9000"
  environment:
    ZK_HOSTS: "zookeeper:2181"
```

访问 [http://localhost:9000](http://localhost:9000/) 查看监控数据。