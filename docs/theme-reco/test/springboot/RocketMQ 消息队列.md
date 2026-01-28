---
title: RocketMQ 消息队列
date: 2026-01-23
tags:
 - RocketMQ 
 - Springboot
categories:
 - 项目实战
 - 练习
---

# RocketMQ 消息队列在微服务中的应用实战

## 一、背景介绍

在微服务架构中，通知功能往往需要向多个用户发送消息。如果在业务主流程中同步发送通知，会导致以下问题：

1. **性能瓶颈**：批量发送通知会阻塞主流程，影响用户体验
2. **事务耦合**：通知失败可能导致主业务回滚
3. **扩展性差**：无法灵活应对通知量激增的场景

**解决方案**：引入 RocketMQ 消息队列，将通知发送改为异步处理。

------

## 二、RocketMQ 安装与配置

### 2.1 使用 Docker Compose 快速部署

创建 `docker-compose.yml` 文件：



```yaml
version: '3.8'
services:
  rocketmq-namesrv:
    image: apache/rocketmq:5.1.4
    container_name: motorcycle-club-rocketmq-namesrv
    ports:
      - "9876:9876"
    command: sh mqnamesrv
  rocketmq-broker:
    image: apache/rocketmq:5.1.4
    container_name: motorcycle-club-rocketmq-broker
    ports:
      - "10909:10909"
      - "10911:10911"
      - "10912:10912"
    environment:
      - NAMESRV_ADDR=rocketmq-namesrv:9876
      # ✅ 关键：让 Broker 告诉客户端连接到本机地址
    command: sh mqbroker -n rocketmq-namesrv:9876 -c /home/rocketmq/rocketmq-5.1.4/conf/broker.conf
    depends_on:
      - rocketmq-namesrv
    volumes:
      - ./broker.conf:/home/rocketmq/rocketmq-5.1.4/conf/broker.conf
    # ✅ 如果需要RocketMQ 可视化控制台，需要将brokerIP1=改为公网ip（可选）
  rocketmq-dashboard:
    image: apacherocketmq/rocketmq-dashboard:latest
    container_name: motorcycle-club-rocketmq-dashboard
    ports:
      - "8180:8082"  # ✅ 浏览器访问 http://localhost:8180
    environment:
      - JAVA_OPTS=-Drocketmq.namesrv.addr=rocketmq-namesrv:9876
    depends_on:
      - rocketmq-namesrv
```

### 2.2 Broker 配置文件

创建 `broker.conf` 文件（与 `docker-compose.yml` 同目录）：



```
brokerClusterName = DefaultCluster
brokerName = broker-a
brokerId = 0
deleteWhen = 04
fileReservedTime = 48
brokerRole = ASYNC_MASTER
flushDiskType = ASYNC_FLUSH
#如果需要RocketMQ 可视化控制台，需要将brokerIP1=改为公网ip
brokerIP1 = 127.0.0.1
listenPort = 10911
```

### 2.3 启动服务

```
docker-compose up -d
```

验证服务状态：

```
docker ps# 应看到两个容器运行：rocketmq-namesrv 和 rocketmq-broker
```

------

## 三、Spring Boot 项目配置

### 3.1 添加 Maven 依赖

在 **父 POM** (`pom.xml`) 中统一管理版本：

```xml
<properties>    
	<rocketmq.version>2.3.0</rocketmq.version>
</properties>
<dependencyManagement>    
    <dependencies>        
        <dependency>
            <groupId>org.apache.rocketmq</groupId>
            <artifactId>rocketmq-spring-boot-starter</artifactId>
            <version>${rocketmq.version}</version>
        </dependency>   
    </dependencies>
</dependencyManagement>
```

在 **子模块** (`core-service/pom.xml`) 中引入依赖：

```xml
<!-- RocketMQ Spring Boot Starter -->
        <dependency>
            <groupId>org.apache.rocketmq</groupId>
            <artifactId>rocketmq-spring-boot-starter</artifactId>
        </dependency>
```

### 3.2 Nacos 配置中心统一配置

在 Nacos 创建配置文件 `rocketmq-common.yml`（`DEFAULT_GROUP`）：

```yaml
rocketmq:  
	name-server: 127.0.0.1:9876  
	producer:    
		group: motorcycle-club-producer    
		send-message-timeout: 5000  # 发送超时（毫秒）    
		retry-times-when-send-failed: 3  # 同步发送失败重试次数    
		retry-times-when-send-async-failed: 3  # 异步发送失败重试次数
```

### 3.3 服务引入共享配置

修改 `core-service/src/main/resources/bootstrap.yml`：



```yaml
# auth-service/src/main/resources/bootstrap.yml
spring:
  application:
    name: core-service  # 必需：服务名
  cloud:
    nacos:
      discovery:
        server-addr: 127.0.0.1:8848  # 必需：Nacos 地址
      config:
        server-addr: 127.0.0.1:8848  # 必需：Nacos Config 地址
        file-extension: yml           # 必需：配置文件格式
        # 引入共享配置
        shared-configs:
          - data-id: jwt-common.yml
            group: DEFAULT_GROUP
            refresh: true
          - data-id: rocketmq-common.yml  # 新增：rocketmq-common.yml 地址
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
 * 用于 RocketMQ 消息传递
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
     * 创建单条通知消息
     */
    public static NotificationMessage single(Long userId, String title, String content, String type) {
        NotificationMessage msg = new NotificationMessage();
        msg.setUserId(userId);
        msg.setTitle(title);
        msg.setContent(content);
        msg.setType(type);
        return msg;
    }

    /**
     * 创建批量通知消息
     */
    public static NotificationMessage batch(List<Long> userIds, String title, String content, String type) {
        NotificationMessage msg = new NotificationMessage();
        msg.setUserIds(userIds);
        msg.setTitle(title);
        msg.setContent(content);
        msg.setType(type);
        return msg;
    }
}
```

------

### 4.2 消息生产者（Producer）

创建 `NotificationProducer.java`：



```java
// core-service/src/main/java/com/example/core/mq/NotificationProducer.java
package com.example.core.mq;
import com.example.core.dto.NotificationMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.rocketmq.client.producer.SendCallback;
import org.apache.rocketmq.client.producer.SendResult;
import org.apache.rocketmq.spring.core.RocketMQTemplate;
import org.springframework.stereotype.Component;
import java.util.List;
/**
 * 通知消息生产者（异步发送）
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class NotificationProducer {
    private final RocketMQTemplate rocketMQTemplate;
    // 常量定义
    private static final String TOPIC = "TOPIC_NOTIFICATION";
    private static final String TAG_SINGLE = "SINGLE";
    private static final String TAG_BATCH = "BATCH";
    private static final int SEND_TIMEOUT = 5000;  // 超时时间 5 秒
    /**
     * 发送单条通知（异步）
     */
    public void sendNotification(Long userId, String title, String content, String type) {
        try {
            NotificationMessage message = NotificationMessage.single(userId, title, content, type);
            String destination = TOPIC + ":" + TAG_SINGLE;
            rocketMQTemplate.asyncSend(destination, message, new SendCallback() {
                @Override
                public void onSuccess(SendResult sendResult) {
                    log.info("✅ [MQ] 发送单条通知成功: userId={}, title={}, msgId={}",
                            userId, title, sendResult.getMsgId());
                }
                @Override
                public void onException(Throwable e) {
                    log.error("❌ [MQ] 发送单条通知失败: userId={}, title={}",
                            userId, title, e);
                }
            }, SEND_TIMEOUT);
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
            String destination = TOPIC + ":" + TAG_BATCH;
            rocketMQTemplate.asyncSend(destination, message, new SendCallback() {
                @Override
                public void onSuccess(SendResult sendResult) {
                    log.info("✅ [MQ] 批量发送通知成功: count={}, title={}, msgId={}",
                            userIds.size(), title, sendResult.getMsgId());
                }
                @Override
                public void onException(Throwable e) {
                    log.error("❌ [MQ] 批量发送通知失败: count={}, title={}",
                            userIds.size(), title, e);
                }
            }, SEND_TIMEOUT);
            log.info("📤 [MQ] 已提交批量通知发送任务: count={}, title={}", userIds.size(), title);
        } catch (Exception e) {
            log.error("❌ [MQ] 提交批量通知发送任务失败: count={}", userIds.size(), e);
        }
    }
}
```

------

### 4.3 消息消费者（Consumer）

创建 `NotificationConsumer.java`：



```java
// core-service/src/main/java/com/example/core/mq/NotificationConsumer.java
package com.example.core.mq;

import com.example.core.dto.NotificationMessage;
import com.example.core.service.NotificationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.rocketmq.spring.annotation.RocketMQMessageListener;
import org.apache.rocketmq.spring.core.RocketMQListener;
import org.springframework.stereotype.Component;

/**
 * 通知消息消费者
 */
@Slf4j
@Component
@RocketMQMessageListener(
        topic = "TOPIC_NOTIFICATION",  // ✅ 直接写字符串
        consumerGroup = "notification-consumer-group"
)
@RequiredArgsConstructor
public class NotificationConsumer implements RocketMQListener<NotificationMessage> {

    private final NotificationService notificationService;

    @Override
    public void onMessage(NotificationMessage message) {
        try {
            log.info("📩 [MQ] 收到通知消息: userId={}, title={}",
                    message.getUserId(), message.getTitle());

            if (message.getUserId() != null) {
                notificationService.sendNotification(
                        message.getUserId(),
                        message.getTitle(),
                        message.getContent(),
                        message.getType()
                );
            } else if (message.getUserIds() != null && !message.getUserIds().isEmpty()) {
                notificationService.batchSendNotifications(
                        message.getUserIds(),
                        message.getTitle(),
                        message.getContent(),
                        message.getType()
                );
            }

            log.info("✅ [MQ] 处理通知消息成功");
        } catch (Exception e) {
            log.error("❌ [MQ] 处理通知消息失败", e);
            throw new RuntimeException("处理通知消息失败", e);
        }
    }
}
```

------

### 4.4 通知工具类（NotificationUtil）

创建 `NotificationUtil.java`：

```java
package com.example.core.mq;

import com.example.core.entity.Role;
import com.example.core.entity.UserRole;
import com.example.core.service.RoleService;
import com.example.core.service.UserRoleService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 通知工具类（业务封装层）
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class NotificationUtil {

    private final NotificationProducer notificationProducer;
    private final RoleService roleService;
    private final UserRoleService userRoleService;

    // ========== 基础方法（简单转发）==========

    /**
     * 发送单条通知
     */
    public void send(Long userId, String title, String content, String type) {
        notificationProducer.sendNotification(userId, title, content, type);
    }

    /**
     * 批量发送通知
     */
    public void batchSend(List<Long> userIds, String title, String content, String type) {
        notificationProducer.batchSendNotifications(userIds, title, content, type);
    }

    // ========== 业务封装（处理"谁"的问题）==========

    /**
     * ✅ 通知所有会员（需要传入会员用户ID列表）
     */
    public void notifyAllMembers(List<Long> memberUserIds, String title, String content, String type) {
        if (memberUserIds != null && !memberUserIds.isEmpty()) {
            batchSend(memberUserIds, title, content, type);
        }
    }

    /**
     * 通知所有管理员
     */
    public void notifyAllAdmins(String title, String content, String type) {
        List<Long> adminUserIds = getAllAdminUserIds();
        if (!adminUserIds.isEmpty()) {
            batchSend(adminUserIds, title, content, type);
        }
    }

    /**
     * 获取所有管理员用户ID
     */
    private List<Long> getAllAdminUserIds() {
        List<Role> adminRoles = roleService.lambdaQuery()
                .in(Role::getCode, "admin", "super")
                .list();

        if (adminRoles.isEmpty()) {
            return List.of();
        }

        List<Long> adminRoleIds = adminRoles.stream()
                .map(Role::getId)
                .toList();

        return userRoleService.lambdaQuery()
                .in(UserRole::getRoleId, adminRoleIds)
                .list()
                .stream()
                .map(UserRole::getUserId)
                .distinct()
                .toList();
    }
}
```



### 4.5 业务层改造

修改 `ActivityServiceImpl.java`（活动报名示例）：



```java
package com.example.core.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.example.common.exception.SpringException;
import com.example.common.result.HttpResult;
import com.example.core.dto.ActivityDTO;
import com.example.core.entity.Activity;
import com.example.core.mapper.ActivityMapper;
import com.example.core.mq.NotificationUtil;// ✅ 添加
import com.example.core.service.ActivityService;
import com.example.core.service.MemberService;  // ✅ 添加
import com.github.pagehelper.PageHelper;
import com.github.pagehelper.PageInfo;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 活动服务实现类
 * @author yihui
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ActivityServiceImpl extends ServiceImpl<ActivityMapper, Activity>
        implements ActivityService {

    private final ActivityMapper activityMapper;
    private final NotificationUtil notificationUtil;// ✅ 添加
    private final MemberService memberService;  // ✅ 添加

    // ========== 查询操作 ==========

    @Override
    public PageInfo<ActivityDTO> pageActivitiesWithDTO(int page, int pageSize, String keyword) {
        try {
            PageHelper.startPage(page, pageSize);
            List<Activity> activityList = activityMapper.selectByKeyword(keyword);
            PageInfo<Activity> activityPageInfo = new PageInfo<>(activityList);

            if (activityList.isEmpty()) {
                return createEmptyPageInfo(activityPageInfo);
            }

            return convertToPageInfo(activityPageInfo);
        } catch (Exception e) {
            log.error("查询活动分页失败", e);
            throw new SpringException("查询活动分页失败: " + e.getMessage(), 500, e);
        }
    }

    // ========== CUD 操作 ==========

    @Override
    @Transactional(rollbackFor = Exception.class)
    public HttpResult<String> addActivity(ActivityDTO dto) {
        Activity activity = convertToEntity(dto);
        activity.setCurrentParticipants(0);

        boolean success = this.save(activity);
        if (!success) {
            return HttpResult.error(500, "新增活动失败");
        }

        // ✅ 先获取所有会员的用户ID
        List<Long> memberUserIds = memberService.getAllMemberUserIds();

        // ✅ 批量通知所有会员（传入会员用户ID列表）
        notificationUtil.notifyAllMembers(
                memberUserIds,  // ✅ 添加这个参数
                "新活动发布通知",
                String.format("新活动【%s】已发布！活动类型：%s，开始时间：%s，地点：%s",
                        activity.getActivityName(),
                        activity.getActivityType(),
                        activity.getStartTime(),
                        activity.getLocation()),
                "ACTIVITY"
        );

        log.info("✅ 新活动已发布并通知 {} 位会员: {}", memberUserIds.size(), activity.getActivityName());
        return HttpResult.ok("新增成功");
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public HttpResult<String> updateActivity(ActivityDTO dto) {
        if (dto.getId() == null) {
            return HttpResult.error(400, "活动ID不能为空");
        }

        Activity existingActivity = this.getById(dto.getId());
        if (existingActivity == null) {
            return HttpResult.error(404, "活动不存在");
        }

        Activity activity = convertToEntity(dto);
        // 保留当前报名人数
        activity.setCurrentParticipants(existingActivity.getCurrentParticipants());

        boolean success = this.updateById(activity);
        if (!success) {
            return HttpResult.error(500, "更新活动失败");
        }

        log.info("✅ 活动信息已更新: {}", activity.getActivityName());
        return HttpResult.ok("更新成功");
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public HttpResult<String> deleteActivity(Long activityId) {
        if (activityId == null) {
            return HttpResult.error(400, "活动ID不能为空");
        }

        Activity existingActivity = this.getById(activityId);
        if (existingActivity == null) {
            return HttpResult.error(404, "活动不存在");
        }

        // 检查是否有报名记录
        if (existingActivity.getCurrentParticipants() > 0) {
            return HttpResult.error(400, "该活动已有人报名，无法删除");
        }

        boolean success = this.removeById(activityId);
        if (!success) {
            return HttpResult.error(500, "删除活动失败");
        }

        log.info("✅ 活动已删除: {}", existingActivity.getActivityName());
        return HttpResult.ok("删除成功");
    }

    // ========== 私有辅助方法 ==========

    /**
     * 创建空分页结果
     */
    private PageInfo<ActivityDTO> createEmptyPageInfo(PageInfo<Activity> activityPageInfo) {
        PageInfo<ActivityDTO> emptyPage = new PageInfo<>();
        emptyPage.setList(Collections.emptyList());
        emptyPage.setPageNum(activityPageInfo.getPageNum());
        emptyPage.setPageSize(activityPageInfo.getPageSize());
        emptyPage.setTotal(activityPageInfo.getTotal());
        emptyPage.setPages(activityPageInfo.getPages());
        return emptyPage;
    }

    /**
     * 转换分页数据
     */
    private PageInfo<ActivityDTO> convertToPageInfo(PageInfo<Activity> activityPageInfo) {
        List<ActivityDTO> dtoList = activityPageInfo.getList().stream()
                .map(this::convertToDTO)
                .collect(Collectors.toList());

        PageInfo<ActivityDTO> dtoPage = new PageInfo<>();
        dtoPage.setList(dtoList);
        dtoPage.setPageNum(activityPageInfo.getPageNum());
        dtoPage.setPageSize(activityPageInfo.getPageSize());
        dtoPage.setTotal(activityPageInfo.getTotal());
        dtoPage.setPages(activityPageInfo.getPages());
        return dtoPage;
    }

    /**
     * Entity 转 DTO
     */
    private ActivityDTO convertToDTO(Activity activity) {
        ActivityDTO dto = new ActivityDTO();
        BeanUtils.copyProperties(activity, dto);
        return dto;
    }

    /**
     * DTO 转 Entity
     */
    private Activity convertToEntity(ActivityDTO dto) {
        Activity activity = new Activity();
        BeanUtils.copyProperties(dto, activity);
        return activity;
    }
}
```

修改 `MemberServiceImpl.java`（会员管理示例）：

```java
package com.example.core.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.example.common.result.HttpResult;
import com.example.core.dto.MemberDTO;
import com.example.core.entity.Member;
import com.example.core.mapper.MemberMapper;
import com.example.core.mq.NotificationUtil;// ✅ 添加
import com.example.core.service.MemberService;
import com.github.pagehelper.PageHelper;
import com.github.pagehelper.PageInfo;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

/**
 * 会员服务实现类
 * @author yihui
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MemberServiceImpl extends ServiceImpl<MemberMapper, Member>
        implements MemberService {

    private final MemberMapper memberMapper;
    private final CacheManager cacheManager;
    private final NotificationUtil notificationUtil;  // ✅ 恢复注入（现在不会循环依赖了）

    @Override
    public PageInfo<MemberDTO> pageMembersWithDTO(int page, int pageSize, String keyword) {
        PageHelper.startPage(page, pageSize);
        List<Member> list = memberMapper.selectByKeyword(keyword);
        PageInfo<Member> pageInfo = new PageInfo<>(list);
        return new PageInfo<>(
                pageInfo.getList().stream().map(this::toDTO).toList()
        ){{
            setPageNum(pageInfo.getPageNum());
            setPageSize(pageInfo.getPageSize());
            setTotal(pageInfo.getTotal());
            setPages(pageInfo.getPages());
        }};
    }

    @Override
    @CacheEvict(value = "user:member:status", key = "#dto.userId")
    @Transactional(rollbackFor = Exception.class)
    public HttpResult<String> addMember(MemberDTO dto) {
        if (this.lambdaQuery().eq(Member::getUserId, dto.getUserId()).exists()) {
            return HttpResult.error(400, "该用户已经是会员");
        }
        if (!this.save(toEntity(dto))) {
            return HttpResult.error(500, "新增会员失败");
        }

        // ✅ 发送欢迎通知给新会员
        notificationUtil.send(
                dto.getUserId(),
                "欢迎加入俱乐部！",
                String.format("恭喜 %s 成为俱乐部正式会员！您现在可以参加各类活动、报名课程，享受会员专属权益。",
                        dto.getMemberName()),
                "SYSTEM"
        );

        // ✅ 批量通知所有管理员
        notificationUtil.notifyAllAdmins(
                "新会员加入",
                String.format("新会员【%s】已加入俱乐部", dto.getMemberName()),
                "SYSTEM"
        );

        return HttpResult.ok("新增成功");
    }

    @Override
    @CacheEvict(value = "user:member:status", key = "#dto.userId")  // ✅ 添加缓存清除
    @Transactional(rollbackFor = Exception.class)
    public HttpResult<String> updateMember(MemberDTO dto) {
        if (dto.getId() == null) {
            return HttpResult.error(400, "会员ID不能为空");
        }
        Member member = this.getById(dto.getId());
        if (member == null) {
            return HttpResult.error(404, "会员不存在");
        }
        if (this.lambdaQuery()
                .eq(Member::getPhone, dto.getPhone())
                .ne(Member::getId, dto.getId())
                .exists()) {
            return HttpResult.error(400, "该手机号已被其他会员使用");
        }
        if (!this.updateById(toEntity(dto))) {
            return HttpResult.error(500, "更新会员失败");
        }

        log.info("✅ 会员信息已更新: userId={}", dto.getUserId());
        return HttpResult.ok("更新成功");
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public HttpResult<String> deleteMember(Long memberId) {
        if (memberId == null) {
            return HttpResult.error(400, "会员ID不能为空");
        }
        Member member = this.getById(memberId);
        if (member == null) {
            return HttpResult.error(404, "会员不存在");
        }

        Long userId = member.getUserId();  // ✅ 先保存 userId

        if (!this.removeById(memberId)) {
            return HttpResult.error(500, "删除会员失败");
        }

        clearMemberCache(userId);

        // ✅ 发送会员资格取消通知
        notificationUtil.send(
                userId,
                "会员资格已取消",
                "您的俱乐部会员资格已被取消，如有疑问请联系管理员。",
                "SYSTEM"
        );

        return HttpResult.ok("删除成功");
    }

    /**
     * 清除会员缓存
     */
    private void clearMemberCache(Long userId) {
        if (userId == null) {
            return;
        }
        try {
            cacheManager.getCache("user:member:status").evict(userId);
            log.info("✅ 用户 {} 的会员缓存已清除", userId);
        } catch (Exception e) {
            log.warn("⚠️ 清除会员缓存失败: userId={}", userId, e);
        }
    }

    /**
     * Entity 转 DTO
     */
    private MemberDTO toDTO(Member member) {
        MemberDTO dto = new MemberDTO();
        BeanUtils.copyProperties(member, dto);
        return dto;
    }

    /**
     * DTO 转 Entity
     */
    private Member toEntity(MemberDTO dto) {
        Member member = new Member();
        BeanUtils.copyProperties(dto, member);
        return member;
    }

    /**
     * 检查用户是否为会员（带缓存）
     */
    @Override
    @Cacheable(value = "user:member:status", key = "#userId")
    public Boolean isUserMember(Long userId) {
        if (userId == null) {
            return false;
        }
        return this.lambdaQuery()
                .eq(Member::getUserId, userId)
                .exists();
    }

    /**
     * 获取所有会员的用户ID（供其他服务使用）
     */
    @Override
    public List<Long> getAllMemberUserIds() {
        return this.list()
                .stream()
                .map(Member::getUserId)
                .collect(Collectors.toList());
    }
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

### 6.1 客户端监控数据

http://localhost:8180/

### 6.2 查看消息发送日志



```
📤 [MQ] 已提交批量通知发送任务: count=5, title=新的活动报名✅ [MQ] 批量发送通知成功: count=5, title=新的活动报名, msgId=xxx
```

### 6.3 查看消息消费日志



```
📩 [MQ] 收到通知消息: userId=null, title=新的活动报名✅ [MQ] 处理通知消息成功
```