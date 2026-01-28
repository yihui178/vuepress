---
title: 双 Token 认证机制
date: 2025-12-10
tags:
 - JwtUtils
 - Springboot
categories:
 - 项目实战
 - 练习
---

# 双 Token 认证机制系统中的完整实现

## 一、背景介绍

在现代 Web 应用中，传统的单 Token 认证存在以下问题：

1. **安全性不足**：Access Token 有效期长，泄露后攻击者可长时间使用
2. **用户体验差**：频繁强制用户重新登录
3. **无法主动撤销**：Token 过期前无法强制失效
4. **会话管理困难**：难以实现单点登录和强制下线

**解决方案**：引入 **双 Token 机制**（Access Token + Refresh Token）+ Redis

| 特性         | Access Token         | Refresh Token        |
| :----------- | :------------------- | :------------------- |
| **有效期**   | 短（30分钟）         | 长（7天）            |
| **用途**     | 访问受保护资源       | 刷新 Access Token    |
| **存储位置** | 内存/LocalStorage    | Redis + LocalStorage |
| **泄露风险** | 低（短期失效）       | 需严格保护           |
| **可撤销性** | 无需撤销（自然过期） | 可主动删除（登出）   |

------

## 二、技术架构设计

### 2.1 核心流程图

```
┌─────────┐                 ┌─────────┐                 ┌─────────┐
│ 客户端  │                 │ 后端API │                 │  Redis  │
└────┬────┘                 └────┬────┘                 └────┬────┘
     │                           │                           │
     │  1. 登录 (username+pwd)   │                           │
     ├──────────────────────────>│                           │
     │                           │  2. 验证成功,生成双Token  │
     │                           ├──────────────────────────>│
     │                           │  3. 存储 RefreshToken     │
     │<──────────────────────────┤  (key: refresh:userId)    │
     │  返回 AccessToken +       │<──────────────────────────┤
     │       RefreshToken        │                           │
     │                           │                           │
     │  4. 请求 API (携带AT)     │                           │
     ├──────────────────────────>│  5. 验证 AT               │
     │                           │                           │
     │  6. AT 过期,返回 401      │                           │
     │<──────────────────────────┤                           │
     │                           │                           │
     │  7. 刷新请求 (携带RT)     │                           │
     ├──────────────────────────>│  8. 验证 RT (查Redis)     │
     │                           ├──────────────────────────>│
     │                           │<──────────────────────────┤
     │  9. 返回新 AT             │                           │
     │<──────────────────────────┤                           │
     │                           │                           │
     │  10. 登出                 │  11. 删除 RT              │
     ├──────────────────────────>├──────────────────────────>│
     │<──────────────────────────┤                           │
```

### 2.2 前后端交互时序图

```
前端               后端拦截器           业务层            JWT工具         Redis
 │                    │                 │                 │              │
 │  1. 登录请求         │                 │                 │              │
 ├───────────────────>│                 │                 │              │
 │                    │  2. 验证用户      │                 │              │
 │                    ├────────────────>│                 │              │
 │                    │                 │  3. 生成双Token  │              │
 │                    │                 ├────────────────>│              │
 │                    │                 │                 │  4. 存储RT   │
 │                    │                 │                 ├─────────────>│
 │  5. 返回双Token     │                 │                 │              │
 │<───────────────────┤                 │                 │              │
 │                    │                 │                 │              │
 │  6. 业务请求(AT)    │                 │                 │              │
 ├───────────────────>│  7. 提取AT      │                 │              │
 │                    │  8. 验证AT      │                 │              │
 │                    ├─────────────────────────────────>│              │
 │                    │  9. AT有效      │                 │              │
 │                    │<─────────────────────────────────┤              │
 │                    │  10. 放行       │                 │              │
 │                    ├────────────────>│                 │              │
 │  11. 返回数据       │                 │                 │              │
 │<───────────────────┤                 │                 │              │
 │                    │                 │                 │              │
 │  12. 请求(AT过期)   │                 │                 │              │
 ├───────────────────>│  13. AT验证失败  │                 │              │
 │                    │  14. 返回401    │                 │              │
 │<───────────────────┤                 │                 │              │
 │                    │                 │                 │              │
 │  15. 刷新请求(RT)    │                 │                 │              │
 ├───────────────────>│                 │  16. 验证RT      │              │
 │                    │                 ├────────────────>│              │
 │                    │                 │                 │  17. 查Redis │
 │                    │                 │                 ├─────────────>│
 │                    │                 │                 │  18. RT有效  │
 │                    │                 │                 │<─────────────┤
 │                    │                 │  19. 生成新AT    │              │
 │                    │                 │<────────────────┤              │
 │  20. 返回新AT       │                 │                 │              │
 │<───────────────────┤                 │                 │              │
 │                    │                 │                 │              │
 │  21. 重试原请求      │                 │                 │              │
 ├───────────────────>│                 │                 │              │
 │  22. 返回数据       │                 │                 │              │
 │<───────────────────┤                 │                 │              │
```

------

## 三、环境准备

### 3.1 后端环境

#### 3.1.1 Redis 安装（Docker）

```dockerfile
# docker-compose.yml
version: '3.8'
services:
  redis:
    image: redis:7-alpine
    container_name: mybatis-redis
    ports:
      - "6379:6379"
    restart: unless-stopped
```

启动服务：

```dockerfile
docker-compose up -d
```

#### 3.1.2 Maven 依赖配置

```xml
<!-- pom.xml -->
<dependencies>
    <!-- Redis -->
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-data-redis</artifactId>
    </dependency>

    <!-- JWT -->
    <dependency>
        <groupId>io.jsonwebtoken</groupId>
        <artifactId>jjwt-api</artifactId>
        <version>0.11.5</version>
    </dependency>
    <dependency>
        <groupId>io.jsonwebtoken</groupId>
        <artifactId>jjwt-impl</artifactId>
        <version>0.11.5</version>
        <scope>runtime</scope>
    </dependency>
    <dependency>
        <groupId>io.jsonwebtoken</groupId>
        <artifactId>jjwt-jackson</artifactId>
        <version>0.11.5</version>
        <scope>runtime</scope>
    </dependency>
</dependencies>
```

#### 3.1.3 配置文件

```yaml
# application.yml
spring:
  data:
    redis:
      host: 127.0.0.1
      port: 6379

jwt:
  secret: ${JWT_SECRET}  # 环境变量配置（至少256位）
  access-token-expire-ms: 1800000   # 30分钟
  refresh-token-expire-ms: 604800000 # 7天
```

### 3.2 前端环境

#### 3.2.1 技术栈

- Vue 3 + TypeScript
- Axios（封装在 `@vben/request`）
- Pinia（状态管理）
- Vue Router（路由守卫）
- Element Plus（UI 组件）

#### 3.2.2 项目结构

```
src/
├── api/
│   ├── core/
│   │   └── auth.ts          # 认证接口定义
│   └── request.ts           # Axios 封装（拦截器）
├── router/
│   └── guard.ts             # 路由守卫
├── store/
│   └── auth.ts              # 认证状态管理
└── views/
    └── auth/
        └── login.vue        # 登录页面
```

------

## 四、后端实现

### 4.1 JWT 工具类（双 Token 支持）

```java
package com.example.mybatis.utils;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.util.Date;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * JWT 工具类：双 Token + Redis
 * @author yihui
 */
@Component
@RequiredArgsConstructor
public class JwtUtils {
    private final RedisUtil redisUtil;

    @Value("${jwt.secret}")
    private String secret;

    @Value("${jwt.access-token-expire-ms:1800000}") // 30分钟
    private long accessTokenExpireMs;

    @Value("${jwt.refresh-token-expire-ms:604800000}") // 7天
    private long refreshTokenExpireMs;

    private Key getSigningKey() {
        return Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    // ========== Access Token ==========
    
    /**
     * 生成 Access Token
     */
    public String generateAccessToken(Long userId, String username, List<String> roles) {
        return Jwts.builder()
                .setSubject(username)
                .claim("userId", userId)
                .claim("roles", roles)
                .claim("type", "access")
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + accessTokenExpireMs))
                .signWith(getSigningKey(), SignatureAlgorithm.HS256)
                .compact();
    }

    // ========== Refresh Token ==========
    
    /**
     * 生成 Refresh Token 并存入 Redis
     */
    public String generateRefreshToken(Long userId, String username) {
        String refreshToken = Jwts.builder()
                .setSubject(username)
                .claim("userId", userId)
                .claim("type", "refresh")
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + refreshTokenExpireMs))
                .signWith(getSigningKey(), SignatureAlgorithm.HS256)
                .compact();

        // 存入 Redis（key: refresh:userId, value: refreshToken）
        String redisKey = "refresh:" + userId;
        redisUtil.set(redisKey, refreshToken, refreshTokenExpireMs, TimeUnit.MILLISECONDS);
        
        return refreshToken;
    }

    /**
     * 验证 Refresh Token 是否有效
     */
    public boolean validateRefreshToken(String refreshToken) {
        try {
            Claims claims = parseClaims(refreshToken);
            Long userId = claims.get("userId", Long.class);
            String type = claims.get("type", String.class);

            // 检查类型
            if (!"refresh".equals(type)) {
                return false;
            }

            // 检查 Redis 中是否存在且匹配
            String redisKey = "refresh:" + userId;
            String storedToken = redisUtil.get(redisKey);
            return refreshToken.equals(storedToken);
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * 删除 Refresh Token（登出时调用）
     */
    public void deleteRefreshToken(Long userId) {
        redisUtil.delete("refresh:" + userId);
    }

    // ========== 通用方法 ==========
    
    /**
     * 解析 Claims
     */
    public Claims parseClaims(String token) {
        return Jwts.parserBuilder()
                .setSigningKey(getSigningKey())
                .build()
                .parseClaimsJws(token)
                .getBody();
    }

    /**
     * 从 Token 提取 userId
     */
    public Long parseUserId(String token) {
        Claims claims = parseClaims(token);
        Object value = claims.get("userId");
        if (value instanceof Number) {
            return ((Number) value).longValue();
        }
        if (value instanceof String) {
            return Long.valueOf((String) value);
        }
        return null;
    }
}
```

### 4.2 Redis 工具类

```java
package com.example.mybatis.utils;

import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import java.util.concurrent.TimeUnit;

/**
 * Redis 工具类
 * @author yihui
 */
@Component
@RequiredArgsConstructor
public class RedisUtil {
    private final StringRedisTemplate redisTemplate;

    /**
     * 设置键值对（带过期时间）
     */
    public void set(String key, String value, long timeout, TimeUnit unit) {
        redisTemplate.opsForValue().set(key, value, timeout, unit);
    }

    /**
     * 获取值
     */
    public String get(String key) {
        return redisTemplate.opsForValue().get(key);
    }

    /**
     * 删除键
     */
    public Boolean delete(String key) {
        return redisTemplate.delete(key);
    }

    /**
     * 检查键是否存在
     */
    public Boolean hasKey(String key) {
        return redisTemplate.hasKey(key);
    }
}
```

### 4.3 JWT 拦截器

```java
package com.example.mybatis.config;

import com.example.mybatis.utils.JwtUtils;
import io.jsonwebtoken.Claims;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;
import java.util.List;

/**
 * JWT 拦截器 - 支持双 Token 机制
 * @author yihui
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class JwtInterceptor implements HandlerInterceptor {
    private final JwtUtils jwtUtils;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response,
                             Object handler) throws Exception {
        // 放行 OPTIONS 预检请求
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }

        // 提取 Access Token
        String accessToken = extractToken(request, "Authorization");

        if (accessToken == null) {
            log.warn("请求缺少 Access Token: {}", request.getRequestURI());
            return unauthorized(response, "Token缺失，请登录");
        }

        try {
            // 解析 Token 并存储用户信息
            Claims claims = jwtUtils.parseClaims(accessToken);
            Long userId = claims.get("userId", Long.class);
            String username = claims.getSubject();
            @SuppressWarnings("unchecked")
            List<String> roles = claims.get("roles", List.class);

            request.setAttribute("userId", userId);
            request.setAttribute("username", username);
            request.setAttribute("roles", roles);

            log.debug("用户认证成功: userId={}, username={}", userId, username);
            return true;

        } catch (Exception e) {
            log.warn("Access Token 验证失败: {}", e.getMessage());

            // 尝试使用 Refresh Token
            String refreshToken = extractToken(request, "X-Refresh-Token");
            if (refreshToken != null && jwtUtils.validateRefreshToken(refreshToken)) {
                return unauthorized(response, "Access Token 已过期，请刷新");
            }

            return unauthorized(response, "Token 无效或已过期，请重新登录");
        }
    }

    /**
     * 从请求头提取 Token
     */
    private String extractToken(HttpServletRequest request, String headerName) {
        String authHeader = request.getHeader(headerName);
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            return authHeader.substring(7);
        }
        return null;
    }

    /**
     * 统一错误响应
     */
    private boolean unauthorized(HttpServletResponse response, String message) throws Exception {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write(
                String.format("{\"code\":401,\"message\":\"%s\"}", message)
        );
        return false;
    }
}
```

### 4.4 Web 配置（注册拦截器）

```java
package com.example.mybatis.config;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Web MVC 配置：注册拦截器
 * @author yihui
 */
@Configuration
@RequiredArgsConstructor
public class WebConfig implements WebMvcConfigurer {
    private final JwtInterceptor jwtInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(jwtInterceptor)
                .addPathPatterns("/**") // 拦截所有请求
                .excludePathPatterns(
                        "/auth/login",           // 登录
                        "/auth/register",        // 注册
                        "/auth/verifyCaptcha",   // 验证码校验
                        "/auth/refreshToken",    // 刷新 Token
                        "/captcha/**",           // 验证码
                        "/druid/**",             // Druid 监控
                        "/swagger-ui/**",        // Swagger
                        "/v3/api-docs/**",
                        "/test/**"              // 测试接口（生产环境需删除）
                );
    }
}
```

### 4.5 请求工具类（提取用户信息）

```java
package com.example.mybatis.utils;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 请求工具类 - 从 Request Attribute 提取用户信息
 * @author yihui
 */
public class RequestUtils {
    /**
     * 获取当前用户 ID（严格模式）
     */
    public static Long getCurrentUserId(HttpServletRequest request) {
        Object userIdObj = request.getAttribute("userId");
        if (userIdObj == null) {
            throw new RuntimeException("用户未登录");
        }
        return (Long) userIdObj;
    }

    /**
     * 安全获取用户 ID（不抛异常）
     */
    public static Long getCurrentUserIdSafely(HttpServletRequest request) {
        try {
            Object userIdObj = request.getAttribute("userId");
            return userIdObj != null ? (Long) userIdObj : null;
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * 获取用户名
     */
    public static String getCurrentUsername(HttpServletRequest request) {
        Object usernameObj = request.getAttribute("username");
        return usernameObj != null ? (String) usernameObj : null;
    }
}
```

### 4.6 认证控制器

```java
package com.example.mybatis.controller;

import com.example.mybatis.common.HttpResult;
import com.example.mybatis.dto.UserDTO;
import com.example.mybatis.service.AuthService;
import com.example.mybatis.utils.RequestUtils;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

/**
 * 认证控制器
 * @author yihui
 */
@Slf4j
@RestController
@RequiredArgsConstructor
public class AuthController {
    private final AuthService authService;

    // ========== 公开接口 ==========
    
    /** 用户登录 */
    @PostMapping("/auth/login")
    public HttpResult<Map<String, Object>> login(@RequestBody Map<String, String> loginForm) {
        return HttpResult.ok(authService.login(loginForm));
    }

    /** 用户注册 */
    @PostMapping("/auth/register")
    public HttpResult<UserDTO> register(@RequestBody Map<String, Object> registerForm) {
        return HttpResult.ok(authService.register(registerForm), "注册成功，请登录");
    }

    /** 验证滑块验证码 */
    @PostMapping("/auth/verifyCaptcha")
    public HttpResult<String> verifyCaptcha(@RequestBody Map<String, String> form) {
        authService.verifyCaptcha(form.get("captcha"));
        return HttpResult.ok("验证通过");
    }

    /** 刷新 Token */
    @PostMapping("/auth/refreshToken")
    public HttpResult<Map<String, String>> refreshToken(@RequestBody Map<String, String> body) {
        String newAccessToken = authService.refreshToken(body.get("refreshToken"));
        return HttpResult.ok(Map.of("accessToken", newAccessToken));
    }

    // ========== 需要登录的接口 ==========
    
    /** 获取用户信息 */
    @GetMapping("/user/info")
    public HttpResult<UserDTO> getUserInfo(HttpServletRequest request) {
        Long userId = RequestUtils.getCurrentUserId(request);
        return HttpResult.ok(authService.getUserInfo(userId));
    }

    /** 获取用户的按钮权限码 */
    @GetMapping("/auth/codes")
    public HttpResult<List<String>> getAccessCodes(HttpServletRequest request) {
        Long userId = RequestUtils.getCurrentUserId(request);
        return HttpResult.ok(authService.getAccessCodes(userId));
    }

    /** 获取用户的角色和权限 */
    @GetMapping("/auth/access")
    public HttpResult<Map<String, Object>> getAccess(HttpServletRequest request) {
        Long userId = RequestUtils.getCurrentUserId(request);
        return HttpResult.ok(authService.getAccess(userId));
    }

    /** 登出 */
    @PostMapping("/auth/logout")
    public HttpResult<String> logout(HttpServletRequest request) {
        Long userId = RequestUtils.getCurrentUserIdSafely(request);
        if (userId != null) {
            authService.logout(userId);
        }
        return HttpResult.ok("登出成功");
    }
}
```

### 4.7 认证服务实现

```java
package com.example.mybatis.service.impl;

import com.baomidou.mybatisplus.core.toolkit.ObjectUtils;
import com.example.mybatis.common.SpringException;
import com.example.mybatis.dto.UserDTO;
import com.example.mybatis.entity.Permission;
import com.example.mybatis.entity.Role;
import com.example.mybatis.entity.User;
import com.example.mybatis.entity.UserRole;
import com.example.mybatis.service.*;
import com.example.mybatis.utils.JwtUtils;
import io.jsonwebtoken.Claims;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;

/**
 * 认证服务实现类
 * @author yihui
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuthServiceImpl implements AuthService {
    private final UserService userService;
    private final RoleService roleService;
    private final PermissionService permissionService;
    private final UserRoleService userRoleService;
    private final RolePermissionService rolePermissionService;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtils jwtUtils;

    // ========== 公开接口实现 ==========
    
    @Override
    @Transactional(rollbackFor = Exception.class)
    public UserDTO register(Map<String, Object> registerForm) {
        // 提取参数
        String username = (String) registerForm.get("username");
        String password = (String) registerForm.get("password");
        String confirmPassword = (String) registerForm.get("confirmPassword");
        Boolean agreePolicy = parseBoolean(registerForm.get("agreePolicy"));

        // 参数校验
        validateRegisterParams(username, password, confirmPassword, agreePolicy);

        // 检查用户名是否已存在
        if (userService.lambdaQuery().eq(User::getName, username).exists()) {
            throw new SpringException("用户名已被注册，请更换其他用户名", 400);
        }

        // 创建用户
        User newUser = new User();
        newUser.setName(username);
        newUser.setPassword(passwordEncoder.encode(password));
        newUser.setAge(18);
        newUser.setEmail(username + "@example.com");
        userService.save(newUser);

        // 分配默认角色
        assignDefaultRole(newUser.getId());

        // 返回 DTO
        UserDTO userDTO = new UserDTO();
        BeanUtils.copyProperties(newUser, userDTO);
        userDTO.setRole("user");
        return userDTO;
    }

    @Override
    public Map<String, Object> login(Map<String, String> loginForm) {
        // 提取参数
        String username = loginForm.get("username");
        String password = loginForm.get("password");
        String captchaToken = loginForm.get("captcha");

        // 参数校验
        validateLoginParams(username, password, captchaToken);
        verifyCaptcha(captchaToken);

        // 验证用户
        User user = userService.lambdaQuery().eq(User::getName, username).one();
        if (user == null || !passwordEncoder.matches(password, user.getPassword())) {
            throw new SpringException("账号或密码错误", 401);
        }

        // 查询角色
        List<Long> roleIds = userRoleService.listRoleIdsByUserId(user.getId());
        List<String> roleCodes = getRoleCodesByRoleIds(roleIds);

        // ✅ 生成双 Token
        String accessToken = jwtUtils.generateAccessToken(user.getId(), username, roleCodes);
        String refreshToken = jwtUtils.generateRefreshToken(user.getId(), username);

        return Map.of(
                "accessToken", accessToken,
                "refreshToken", refreshToken,
                "roles", roleCodes
        );
    }

    @Override
    public String refreshToken(String refreshToken) {
        if (refreshToken == null || refreshToken.isBlank()) {
            throw new SpringException("Refresh Token 不能为空", 400);
        }

        // ✅ 验证 Refresh Token（会检查 Redis）
        if (!jwtUtils.validateRefreshToken(refreshToken)) {
            throw new SpringException("Refresh Token 无效或已过期", 401);
        }

        // 解析 Token 获取 userId
        Claims claims = jwtUtils.parseClaims(refreshToken);
        Long userId = claims.get("userId", Long.class);
        
        User user = userService.getById(userId);
        if (user == null) {
            throw new SpringException("用户不存在", 401);
        }

        // 重新查询角色
        List<Long> roleIds = userRoleService.listRoleIdsByUserId(userId);
        List<String> roleCodes = getRoleCodesByRoleIds(roleIds);

        // ✅ 生成新的 Access Token
        return jwtUtils.generateAccessToken(userId, user.getName(), roleCodes);
    }

    @Override
    public void verifyCaptcha(String captchaToken) {
        // 校验 token 长度
        if (captchaToken == null || captchaToken.length() < 16) {
            throw new SpringException("验证码校验失败", 401);
        }

        // 提取时间戳并验证是否过期（5分钟）
        try {
            String timestamp = captchaToken.substring(captchaToken.length() - 13);
            long tokenTime = Long.parseLong(timestamp);
            if (System.currentTimeMillis() - tokenTime > 300000) {
                throw new SpringException("验证码已过期", 401);
            }
        } catch (Exception e) {
            throw new SpringException("验证码格式无效", 401);
        }
    }

    // ========== 需要登录的接口（接收 userId） ==========
    
    @Override
    public UserDTO getUserInfo(Long userId) {
        // 校验参数
        if (userId == null) {
            throw new SpringException("用户未登录", 401);
        }

        // 查询用户
        User user = userService.getById(userId);
        if (user == null) {
            throw new SpringException("用户不存在", 404);
        }

        // 查询角色
        List<Long> roleIds = userRoleService.listRoleIdsByUserId(userId);
        List<String> roleCodes = getRoleCodesByRoleIds(roleIds);

        // 封装 DTO
        UserDTO dto = new UserDTO();
        BeanUtils.copyProperties(user, dto);
        dto.setRole(String.join(",", roleCodes));
        return dto;
    }

    @Override
    public List<String> getAccessCodes(Long userId) {
        if (userId == null) {
            throw new SpringException("用户未登录", 401);
        }

        // 查询角色
        List<Long> roleIds = userRoleService.listRoleIdsByUserId(userId);

        // 查询权限
        List<Long> permIds = rolePermissionService.listPermissionIdsByRoleIds(roleIds);

        // 过滤按钮权限
        return permissionService.listByIds(permIds).stream()
                .filter(p -> "button".equalsIgnoreCase(p.getType()))
                .map(Permission::getCode)
                .filter(Objects::nonNull)
                .toList();
    }

    @Override
    public Map<String, Object> getAccess(Long userId) {
        if (userId == null) {
            throw new SpringException("用户未登录", 401);
        }

        // 查询角色
        List<Long> roleIds = userRoleService.listRoleIdsByUserId(userId);
        List<String> roleCodes = getRoleCodesByRoleIds(roleIds);

        // 查询权限
        List<Long> permIds = rolePermissionService.listPermissionIdsByRoleIds(roleIds);
        List<String> permCodes = permissionService.listByIds(permIds).stream()
                .map(Permission::getCode)
                .filter(Objects::nonNull)
                .toList();

        return Map.of("roles", roleCodes, "accessCodes", permCodes);
    }

    @Override
    public void logout(Long userId) {
        if (userId != null) {
            // ✅ 删除 Redis 中的 Refresh Token
            jwtUtils.deleteRefreshToken(userId);
            log.info("用户 {} 已登出", userId);
        }
    }

    // ========== 辅助方法 ==========
    
    @Override
    public List<String> getRoleCodesByRoleIds(List<Long> roleIds) {
        if (roleIds == null || roleIds.isEmpty()) {
            return Collections.emptyList();
        }
        return roleService.listByIds(roleIds).stream()
                .map(Role::getCode)
                .filter(Objects::nonNull)
                .toList();
    }

    // ========== 私有方法：参数校验 ==========
    
    private void validateRegisterParams(String username, String password,
                                        String confirmPassword, Boolean agreePolicy) {
        if (ObjectUtils.isEmpty(username) || username.length() < 2 || username.length() > 20) {
            throw new SpringException("用户名长度需在2-20位之间", 400);
        }
        if (ObjectUtils.isEmpty(password) || password.length() < 6 || password.length() > 20) {
            throw new SpringException("密码长度需在6-20位之间", 400);
        }
        if (!password.equals(confirmPassword)) {
            throw new SpringException("两次输入的密码不一致", 400);
        }
        if (!Boolean.TRUE.equals(agreePolicy)) {
            throw new SpringException("请同意用户协议后再注册", 400);
        }
    }

    private void validateLoginParams(String username, String password, String captchaToken) {
        if (ObjectUtils.isEmpty(username)) {
            throw new SpringException("用户名不能为空", 400);
        }
        if (ObjectUtils.isEmpty(password)) {
            throw new SpringException("密码不能为空", 400);
        }
        if (ObjectUtils.isEmpty(captchaToken) || captchaToken.length() < 16) {
            throw new SpringException("请先完成滑块验证", 401);
        }
    }

    private void assignDefaultRole(Long userId) {
        Role defaultRole = roleService.lambdaQuery().eq(Role::getCode, "user").one();
        if (defaultRole == null) {
            throw new SpringException("系统未配置默认用户角色，请联系管理员", 500);
        }
        UserRole userRole = new UserRole();
        userRole.setUserId(userId);
        userRole.setRoleId(defaultRole.getId());
        userRoleService.save(userRole);
    }

    private Boolean parseBoolean(Object value) {
        if (value instanceof Boolean) {
            return (Boolean) value;
        }
        if (value instanceof String) {
            return "true".equalsIgnoreCase((String) value);
        }
        return false;
    }
}
```

------

## 五、前端实现

### 5.1 API 层（认证接口）

```tsx
// #/api/core/auth.ts
import { baseRequestClient, requestClient } from '#/api/request';

export namespace AuthApi {
  /** 登录参数 */
  export interface LoginParams {
    username: string;
    password: string;
    captcha: string;
  }

  /** 登录返回值 */
  export interface LoginResult {
    accessToken: string;
    refreshToken: string; // ✅ 新增
  }

  /** 刷新 Token 返回值 */
  export interface RefreshTokenResult {
    accessToken: string;
  }

  /** 验证码参数 */
  export interface VerifyCaptchaParams {
    captcha: string;
  }
}

/**
 * 登录
 */
export async function loginApi(data: AuthApi.LoginParams) {
  return requestClient.post<AuthApi.LoginResult>('/auth/login', data);
}

/**
 * ✅ 刷新 Token（使用 baseRequestClient 避免拦截器循环）
 */
export async function refreshTokenApi(refreshToken: string) {
  return baseRequestClient.post<AuthApi.RefreshTokenResult>(
    '/auth/refreshToken',
    { refreshToken }
  );
}

/**
 * 登出
 */
export async function logoutApi() {
  return requestClient.post('/auth/logout');
}

/**
 * 获取用户权限码
 */
export async function getAccessCodesApi() {
  return requestClient.get<string[]>('/auth/codes');
}

/**
 * 获取用户信息
 */
export async function getUserInfoApi() {
  return requestClient.get('/user/info');
}

/**
 * 验证码校验
 */
export async function verifyCaptchaApi(data: AuthApi.VerifyCaptchaParams) {
  return requestClient.post('/auth/verifyCaptcha', data);
}
```

### 5.2 请求拦截器（核心）

```tsx
// #/api/request.ts
import type { RequestClientOptions } from '@vben/request';
import { useAppConfig } from '@vben/hooks';
import { preferences } from '@vben/preferences';
import {
  defaultResponseInterceptor,
  errorMessageResponseInterceptor,
  RequestClient,
} from '@vben/request';
import { useAccessStore } from '@vben/stores';
import { ElMessage, ElNotification } from 'element-plus';
import { refreshTokenApi } from './core';

const { apiURL } = useAppConfig(import.meta.env, import.meta.env.PROD);

// ========== 常量定义 ==========
const PUBLIC_APIS = new Set([
  '/auth/login',
  '/auth/register',
  '/auth/refreshToken',
  '/auth/verifyCaptcha',
]);

const STORAGE_KEYS = [
  'accessToken',
  'refreshToken',
  'accessCodes',
  'isLockScreen',
] as const;

// ========== 全局状态（防止并发刷新）==========
let isReAuthenticating = false;  // 是否正在重新认证
let authFailed = false;          // 认证失败标记，阻止后续请求
let isRefreshing = false;        // 是否正在刷新 Token
let refreshPromise: Promise<string> | null = null; // Token 刷新 Promise

// ========== 工具函数 ==========

/**
 * 判断是否为公开 API
 */
function isPublicAPI(url?: string): boolean {
  if (!url) return false;
  return Array.from(PUBLIC_APIS).some((api) => url.includes(api));
}

/**
 * 格式化 Token
 */
function formatToken(token: null | string): string | null {
  return token ? `Bearer ${token}` : null;
}

/**
 * 清除认证数据
 */
function clearAuthData() {
  const accessStore = useAccessStore();
  accessStore.setAccessToken(null);
  STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
}

/**
 * 提取 Access Token（兼容多种响应格式）
 */
function extractAccessToken(response: any): string | null {
  if (typeof response === 'string') {
    return response;
  }
  if (response?.accessToken) {
    return response.accessToken;
  }
  if (response?.data) {
    const { data } = response;
    if (typeof data === 'string') {
      return data;
    }
    if (data.accessToken) {
      return data.accessToken;
    }
    if (data.data?.accessToken) {
      return data.data.accessToken;
    }
  }
  return null;
}

/**
 * ✅ 重新认证（跳转登录）
 */
async function doReAuthenticate() {
  if (isReAuthenticating) return;
  
  isReAuthenticating = true;
  authFailed = true; // 标记认证失败，阻止后续请求

  clearAuthData();

  ElNotification({
    title: '登录已过期',
    message: '即将跳转到登录页',
    type: 'warning',
    duration: 2000,
  });

  setTimeout(async () => {
    try {
      // 动态导入 router（避免循环依赖）
      const routerModule = await import('#/router');
      const router = (routerModule as any).default || (routerModule as any).router || routerModule;

      await router.replace({
        path: '/auth/login',
        query: {
          redirect: encodeURIComponent(window.location.pathname),
          expired: 'true'
        }
      });
    } catch (error) {
      console.error('路由跳转失败:', error);
      window.location.href = '/auth/login';
    } finally {
      isReAuthenticating = false;
    }
  }, 2000);
}

/**
 * ✅ Token 刷新逻辑（防止并发）
 */
async function doRefreshToken(): Promise<string> {
  // 如果正在刷新，返回已有的 Promise
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;

  refreshPromise = (async () => {
    try {
      const refreshToken = localStorage.getItem('refreshToken');

      if (!refreshToken) {
        throw new Error('Refresh Token 不存在');
      }

      // 调用刷新接口
      const response = await refreshTokenApi(refreshToken);
      const newAccessToken = extractAccessToken(response);

      if (!newAccessToken || typeof newAccessToken !== 'string') {
        throw new Error('刷新失败：Token 为空');
      }

      // 更新 Store 和 LocalStorage
      const accessStore = useAccessStore();
      localStorage.setItem('accessToken', newAccessToken);
      accessStore.setAccessToken(newAccessToken);

      return newAccessToken;
    } catch (error) {
      throw error;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// ========== 创建请求客户端 ==========

function createRequestClient(baseURL: string, options?: RequestClientOptions) {
  const client = new RequestClient({
    ...options,
    baseURL,
  });

  // ========== 请求拦截器 ==========
  
  client.addRequestInterceptor({
    fulfilled: async (config) => {
      // 跳过公开 API
      if (isPublicAPI(config.url)) {
        return config;
      }

      // 认证失败后，阻止所有新请求
      if (authFailed) {
        return new Promise(() => {}); // 静默挂起
      }

      const accessStore = useAccessStore();
      config.headers.Authorization = formatToken(accessStore.accessToken);
      config.headers['Accept-Language'] = preferences.app.locale;
      return config;
    },
  });

  // ========== 响应拦截器 ==========

  // 1. 处理响应数据格式
  client.addResponseInterceptor(
    defaultResponseInterceptor({
      codeField: 'code',
      dataField: 'data',
      successCode: 0,
    }),
  );

  // 2. Token 过期处理（401 自动刷新）
  client.addResponseInterceptor({
    fulfilled: (response) => response,
    rejected: async (error) => {
      const status = error?.response?.status;
      const config = error?.config;

      // 跳过公开 API
      if (isPublicAPI(config?.url)) {
        return Promise.reject(error);
      }

      // ✅ 处理 401 错误
      if (status === 401 && config && !config._retry) {
        config._retry = true; // 标记为已重试，避免死循环

        // 如果正在重新认证，挂起请求
        if (isReAuthenticating || authFailed) {
          return new Promise(() => {}); // 静默挂起
        }

        const refreshToken = localStorage.getItem('refreshToken');

        // Refresh Token 不存在，跳转登录
        if (!refreshToken) {
          await doReAuthenticate();
          return new Promise(() => {});
        }

        try {
          // 刷新 Access Token
          const newAccessToken = await doRefreshToken();

          // 使用新 Token 重试原请求
          config.headers = config.headers || {};
          config.headers.Authorization = `Bearer ${newAccessToken}`;

          const method = (config.method || 'get').toLowerCase();
          const url = config.url || '';

          // 根据原请求方法重新发起请求
          switch (method) {
            case 'get':
              return client.get(url, config);
            case 'post':
              return client.post(url, config.data, config);
            case 'put':
              return client.put(url, config.data, config);
            case 'delete':
              return client.delete(url, config);
            default:
              return client.get(url, config);
          }
        } catch (refreshError) {
          // 刷新失败，跳转登录
          await doReAuthenticate();
          return new Promise(() => {});
        }
      }

      return Promise.reject(error);
    },
  });

  // 3. 错误消息处理
  client.addResponseInterceptor(
    errorMessageResponseInterceptor((msg: string, error) => {
      const statusCode = error?.response?.status;
      const responseData = error?.response?.data ?? {};
      const errorMessage = responseData?.error ?? responseData?.message ?? msg;

      // 跳过 401 错误（已在上面处理）
      if (statusCode === 401) {
        return;
      }

      // 跳过公开 API 的错误提示
      if (isPublicAPI(error?.config?.url)) {
        return;
      }

      ElMessage.error(errorMessage);
    }),
  );

  return client;
}

// ========== 导出实例 ==========

export const requestClient = createRequestClient(apiURL, {
  responseReturn: 'data',
  timeout: 10000,
});

export const baseRequestClient = new RequestClient({
  baseURL: apiURL,
  timeout: 10000,
});

/**
 * ✅ 重置认证状态（登录成功后调用）
 */
export function resetAuthState() {
  authFailed = false;
  isReAuthenticating = false;
  isRefreshing = false;
  refreshPromise = null;
}
```

### 5.3 路由守卫

```tsx
// #/router/guard.ts
import type { Router } from 'vue-router';
import { LOGIN_PATH } from '@vben/constants';
import { preferences } from '@vben/preferences';
import { useAccessStore, useUserStore } from '@vben/stores';
import { startProgress, stopProgress } from '@vben/utils';
import { accessRoutes, coreRouteNames } from '#/router/routes';
import { useAuthStore } from '#/store';
import { generateAccess } from './access';

// ========== 常量定义 ==========

/**
 * 白名单路由（不需要认证）
 */
const WHITE_LIST = new Set([
  LOGIN_PATH,
  '/register',
  '/404',
  '/403',
  '/500',
]);

/**
 * 需要清除的本地存储键
 */
const STORAGE_KEYS = [
  'accessToken',
  'refreshToken',
  'accessCodes',
  'isLockScreen',
] as const;

// ========== 通用守卫 ==========

/**
 * 通用守卫配置（加载进度条）
 */
function setupCommonGuard(router: Router) {
  const loadedPaths = new Set<string>();

  router.beforeEach((to) => {
    to.meta.loaded = loadedPaths.has(to.path);

    if (!to.meta.loaded && preferences.transition.progress) {
      startProgress();
    }

    return true;
  });

  router.afterEach((to) => {
    loadedPaths.add(to.path);

    if (preferences.transition.progress) {
      stopProgress();
    }
  });
}

// ========== 权限守卫 ==========

/**
 * 权限访问守卫配置
 */
function setupAccessGuard(router: Router) {
  router.beforeEach(async (to, from) => {
    const accessStore = useAccessStore();
    const userStore = useUserStore();
    const authStore = useAuthStore();

    // 1️⃣ 白名单路由直接放行
    if (WHITE_LIST.has(to.path)) {
      // 已登录用户访问登录页，重定向到首页
      if (to.path === LOGIN_PATH && accessStore.accessToken) {
        return decodeURIComponent(
          (to.query?.redirect as string) ||
            userStore.userInfo?.homePath ||
            preferences.app.defaultHomePath,
        );
      }
      return true;
    }

    // 2️⃣ 基本路由直接放行
    if (coreRouteNames.includes(to.name as string)) {
      return true;
    }

    // 3️⃣ 检查 Token
    const accessToken = accessStore.accessToken;
    if (!accessToken) {
      return redirectToLogin(to);
    }

    // 4️⃣ Token 刷新由请求拦截器自动处理
    //     路由守卫不再主动刷新 Token

    // 5️⃣ 忽略权限检查的路由
    if (to.meta.ignoreAccess) {
      return true;
    }

    // 6️⃣ 检查是否已生成动态路由
    if (accessStore.isAccessChecked) {
      return true;
    }

    // 7️⃣ 生成动态路由
    try {
      const userInfo = userStore.userInfo || (await authStore.fetchUserInfo());
      const userRoles = userInfo.roles ?? [];

      const { accessibleMenus, accessibleRoutes } = await generateAccess({
        roles: userRoles,
        router,
        routes: accessRoutes,
      });

      accessStore.setAccessMenus(accessibleMenus);
      accessStore.setAccessRoutes(accessibleRoutes);
      accessStore.setIsAccessChecked(true);

      // 计算重定向路径
      const redirectPath = (
        from.query.redirect ??
        (to.path === preferences.app.defaultHomePath
          ? userInfo.homePath || preferences.app.defaultHomePath
          : to.fullPath)
      ) as string;

      return {
        ...router.resolve(decodeURIComponent(redirectPath)),
        replace: true,
      };
    } catch (error) {
      clearAuthData(accessStore);
      return redirectToLogin(to);
    }
  });
}

// ========== 辅助函数 ==========

/**
 * 清除认证数据
 */
function clearAuthData(accessStore: any) {
  accessStore.setAccessToken(null);
  accessStore.setIsAccessChecked(false);
  STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
}

/**
 * 重定向到登录页
 */
function redirectToLogin(to: any) {
  return {
    path: LOGIN_PATH,
    query:
      to.fullPath === preferences.app.defaultHomePath
        ? {}
        : { redirect: encodeURIComponent(to.fullPath) },
    replace: true,
  };
}

// ========== 导出 ==========

/**
 * 创建路由守卫
 */
export function createRouterGuard(router: Router) {
  setupCommonGuard(router);
  setupAccessGuard(router);
}
```

### 5.4 认证状态管理（Pinia）

```tsx
// #/store/auth.ts
import type { UserInfo } from '@vben/types';
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { LOGIN_PATH } from '@vben/constants';
import { preferences } from '@vben/preferences';
import { resetAllStores, useAccessStore, useUserStore } from '@vben/stores';
import { ElNotification } from 'element-plus';
import { defineStore } from 'pinia';
import { 
  getAccessCodesApi, 
  getUserInfoApi, 
  loginApi, 
  logoutApi, 
  type AuthApi 
} from '#/api';
import { $t } from '#/locales';
import { resetAuthState } from '#/api/request';

export const useAuthStore = defineStore('auth', () => {
  const accessStore = useAccessStore();
  const userStore = useUserStore();
  const router = useRouter();

  const loginLoading = ref(false);

  /**
   * ✅ 登录
   */
  async function authLogin(
    params: AuthApi.LoginParams,
    onSuccess?: () => Promise<void> | void,
  ) {
    try {
      loginLoading.value = true;

      const { accessToken, refreshToken } = await loginApi(params);
      
      if (!accessToken) {
        throw new Error('登录失败：未获取到 Token');
      }

      // 存储 Token
      accessStore.setAccessToken(accessToken);
      localStorage.setItem('refreshToken', refreshToken);

      // ✅ 重置认证状态（清除之前的刷新标记）
      resetAuthState();

      // 获取用户信息和权限码
      const [userInfo, accessCodes] = await Promise.all([
        getUserInfoApi(),
        getAccessCodesApi(),
      ]);

      // 添加空值检查
      if (!userInfo) {
        throw new Error('获取用户信息失败');
      }

      userStore.setUserInfo(userInfo);
      accessStore.setAccessCodes(accessCodes);

      // 导航
      if (accessStore.loginExpired) {
        accessStore.setLoginExpired(false);
      } else {
        const homePath = userInfo.homePath || preferences.app.defaultHomePath;
        await (onSuccess?.() ?? router.push(homePath));
      }

      // 显示欢迎通知
      if (userInfo.realName) {
        ElNotification({
          message: `${$t('authentication.loginSuccessDesc')}:${userInfo.realName}`,
          title: $t('authentication.loginSuccess'),
          type: 'success',
        });
      }

      return { userInfo };
    } catch (error) {
      console.error('登录失败:', error);
      throw error;
    } finally {
      loginLoading.value = false;
    }
  }

  /**
   * ✅ 登出
   */
  async function logout(redirect: boolean = true) {
    try {
      await logoutApi();
    } catch {
      // 忽略错误
    }

    resetAllStores();
    localStorage.removeItem('refreshToken');
    accessStore.setLoginExpired(false);

    await router.replace({
      path: LOGIN_PATH,
      query: redirect
        ? { redirect: encodeURIComponent(router.currentRoute.value.fullPath) }
        : {},
    });
  }

  /**
   * 获取用户信息
   */
  async function fetchUserInfo() {
    const userInfo = await getUserInfoApi();

    // 添加空值检查
    if (!userInfo) {
      throw new Error('获取用户信息失败');
    }

    userStore.setUserInfo(userInfo);
    return userInfo;
  }

  function $reset() {
    loginLoading.value = false;
  }

  return {
    $reset,
    authLogin,
    fetchUserInfo,
    loginLoading,
    logout,
  };
});
```

### 5.5 登录页面

```vue
<!-- #/views/auth/login.vue -->
<script lang="ts" setup>
import type { VbenFormSchema } from '@vben/common-ui';
import { computed, markRaw, ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { AuthenticationLogin, SliderCaptcha, z } from '@vben/common-ui';
import { $t } from '@vben/locales';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '#/store';
import { resetAuthState } from '#/api/request';

defineOptions({ name: 'Login' });

const route = useRoute();
const authStore = useAuthStore();
const formRef = ref();
const captchaToken = ref('');
const isSubmitting = ref(false);

// ✅ 页面加载时重置认证状态
onMounted(() => {
  resetAuthState();

  // 检测是否因为过期跳转
  if (route.query.expired === 'true') {
    ElMessage.warning('登录已过期，请重新登录');
  }
});

/**
 * ✅ 滑块验证成功回调
 */
async function handleCaptchaSuccess(result?: any) {
  // 生成验证码 token（格式：随机字符串_时间戳）
  const token = result?.token || `${Math.random().toString(36).substring(2)}_${Date.now()}`;
  captchaToken.value = token;

  const formApi = await formRef.value?.getFormApi();
  await formApi?.setValues({ captcha: true });
  await formApi?.validate(['captcha']);
}

/**
 * ✅ 提交登录表单
 */
async function handleLogin(formData: any) {
  if (isSubmitting.value) return;

  try {
    isSubmitting.value = true;

    // 检查验证码
    if (!captchaToken.value) {
      ElMessage.error('请先完成滑块验证');
      return;
    }

    // 提交登录请求
    const loginData = {
      username: formData.username,
      password: formData.password,
      captcha: captchaToken.value,
    };

    await authStore.authLogin(loginData);
  } catch (error: any) {
    const errorMsg = error?.response?.data?.message || error?.message || '登录失败';
    ElMessage.error(errorMsg);

    // 登录失败后重置验证码
    await resetCaptcha();
  } finally {
    isSubmitting.value = false;
  }
}

/**
 * 重置验证码状态
 */
async function resetCaptcha() {
  captchaToken.value = '';
  const formApi = await formRef.value?.getFormApi();
  await formApi?.setValues({ captcha: false });
}

/**
 * 表单配置
 */
const formSchema = computed((): VbenFormSchema[] => {
  return [
    {
      component: 'VbenInput',
      componentProps: {
        placeholder: $t('authentication.usernameTip'),
      },
      fieldName: 'username',
      label: $t('authentication.username'),
      rules: z.string().min(1, { message: $t('authentication.usernameTip') }),
    },
    {
      component: 'VbenInputPassword',
      componentProps: {
        placeholder: $t('authentication.password'),
      },
      fieldName: 'password',
      label: $t('authentication.password'),
      rules: z.string().min(1, { message: $t('authentication.passwordTip') }),
    },
    {
      component: markRaw(SliderCaptcha),
      componentProps: {
        onSuccess: handleCaptchaSuccess,
      },
      defaultValue: false,
      fieldName: 'captcha',
      label: '滑动验证',
      rules: z.boolean().refine((val) => val === true, {
        message: $t('authentication.verifyRequiredTip'),
      }),
    },
  ];
});
</script>

<template>
  <AuthenticationLogin
    ref="formRef"
    :form-schema="formSchema"
    :loading="authStore.loginLoading || isSubmitting"
    :show-code-login="false"
    :show-forget-password="true"
    :show-qrcode-login="false"
    :show-register="true"
    :show-remember-me="true"
    :show-third-party-login="false"
    sub-title="🏍️基于SpringBoot的管理系统"
    title="摩托车骑行俱乐部"
    @submit="handleLogin"
  />
</template>
```

------

## 六、前后端交互流程详解

### 6.1 登录流程

#### 前端流程

```tsx
// 1. 用户提交登录表单
const loginData = {
  username: 'admin',
  password: '123456',
  captcha: 'valid-token_1706345678901'
};

// 2. 调用登录 API
const { accessToken, refreshToken } = await loginApi(loginData);

// 3. 存储 Token
accessStore.setAccessToken(accessToken);           // ✅ 存入 Pinia Store
localStorage.setItem('refreshToken', refreshToken); // ✅ 持久化到本地

// 4. 重置认证状态
resetAuthState(); // ✅ 清除 authFailed、isRefreshing 等标记

// 5. 获取用户信息和权限
const [userInfo, accessCodes] = await Promise.all([
  getUserInfoApi(),
  getAccessCodesApi(),
]);

// 6. 跳转首页
router.push(userInfo.homePath || '/dashboard');
```

#### 后端处理



```java
// 1. 验证用户名密码
User user = userService.lambdaQuery().eq(User::getName, username).one();
if (!passwordEncoder.matches(password, user.getPassword())) {
    throw new SpringException("账号或密码错误", 401);
}

// 2. 查询用户角色
List<Long> roleIds = userRoleService.listRoleIdsByUserId(user.getId());
List<String> roleCodes = getRoleCodesByRoleIds(roleIds);

// 3. 生成双 Token
String accessToken = jwtUtils.generateAccessToken(userId, username, roleCodes);
String refreshToken = jwtUtils.generateRefreshToken(userId, username);
// ✅ Refresh Token 自动存入 Redis（key: refresh:userId）

// 4. 返回响应
return Map.of(
    "accessToken", accessToken,
    "refreshToken", refreshToken,
    "roles", roleCodes
);
```

**请求示例**：

```json
curl -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "123456",
    "captcha": "valid-token_1706345678901"
  }'
```

**响应示例**：

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "roles": ["admin", "user"]
  }
}
```

------

### 6.2 访问受保护资源

#### 前端流程

```tsx
// 1. 请求拦截器自动注入 Access Token
config.headers.Authorization = `Bearer ${accessStore.accessToken}`;

// 2. 发起请求
const userInfo = await requestClient.get('/user/info');
```

#### 后端处理

```java
// 1. 拦截器提取 Token
String accessToken = request.getHeader("Authorization").substring(7);

// 2. 解析并验证 Token
Claims claims = jwtUtils.parseClaims(accessToken);
Long userId = claims.get("userId", Long.class);

// 3. 存储到 Request Attribute
request.setAttribute("userId", userId);
request.setAttribute("username", claims.getSubject());

// 4. 放行请求
return true;

// 5. 业务层使用
Long userId = RequestUtils.getCurrentUserId(request);
User user = userService.getById(userId);
```

**请求示例**：

```json
curl -X GET http://localhost:8080/user/info \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**响应示例**：

```json
{
  "code": 200,
  "data": {
    "id": 1,
    "name": "admin",
    "email": "admin@example.com",
    "role": "admin,user"
  }
}
```

------

### 6.3 Token 刷新流程（核心）

#### 场景：Access Token 过期（30分钟后）

**前端自动处理流程**：

```tsx
// 1. 请求返回 401
response.status === 401

// 2. 响应拦截器检测
if (status === 401 && !config._retry) {
  config._retry = true; // ✅ 标记已重试，避免死循环

  // 3. 检查 Refresh Token
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) {
    // 跳转登录
    await doReAuthenticate();
    return;
  }

  // 4. 调用刷新接口（防并发）
  const newAccessToken = await doRefreshToken();
  // ✅ 如果有多个 401 请求，它们会复用同一个 refreshPromise

  // 5. 更新请求头
  config.headers.Authorization = `Bearer ${newAccessToken}`;

  // 6. 重试原请求
  return client.post(config.url, config.data, config);
}
```

**防并发机制详解**：

```tsx
// 全局变量
let isRefreshing = false;
let refreshPromise: Promise<string> | null = null;

async function doRefreshToken(): Promise<string> {
  // ✅ 第一个 401 请求：创建 Promise
  if (!isRefreshing) {
    isRefreshing = true;
    refreshPromise = (async () => {
      const response = await refreshTokenApi(refreshToken);
      return extractAccessToken(response);
    })();
  }

  // ✅ 后续 401 请求：复用 Promise
  return refreshPromise;
}
```

**时序图**：

```
请求A ──401──> 拦截器 ──> doRefreshToken() ──> 创建 Promise ──┐
                                                            │
请求B ──401──> 拦截器 ──> doRefreshToken() ──> 复用 Promise ──┤
                                                            ├──> 刷新接口
请求C ──401──> 拦截器 ──> doRefreshToken() ──> 复用 Promise ──┘
                                                            │
                                                            ▼
                                                      返回新 Token
                                                            │
           ┌────────────────────────────────────────────────┤
           │                                                │
           ▼                                                ▼
      重试请求A                                        重试请求B/C
```

#### 后端处理

```java
@PostMapping("/auth/refreshToken")
public HttpResult<Map<String, String>> refreshToken(@RequestBody Map<String, String> body) {
    String refreshToken = body.get("refreshToken");
    
    // 1. 验证 Refresh Token（检查 Redis）
    if (!jwtUtils.validateRefreshToken(refreshToken)) {
        throw new SpringException("Refresh Token 无效或已过期", 401);
    }
    
    // 2. 解析 Token 获取 userId
    Claims claims = jwtUtils.parseClaims(refreshToken);
    Long userId = claims.get("userId", Long.class);
    
    // 3. 重新查询用户角色
    List<Long> roleIds = userRoleService.listRoleIdsByUserId(userId);
    List<String> roleCodes = getRoleCodesByRoleIds(roleIds);
    
    // 4. 生成新的 Access Token
    String newAccessToken = jwtUtils.generateAccessToken(userId, username, roleCodes);
    
    return HttpResult.ok(Map.of("accessToken", newAccessToken));
}
```

**请求示例**：

```json
curl -X POST http://localhost:8080/auth/refreshToken \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'
```

**响应示例**：

```json
{
  "code": 200,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

------

### 6.4 登出流程

#### 前端处理

```tsx
async function logout() {
  try {
    // 1. 调用登出接口
    await logoutApi();
  } catch {
    // 忽略错误
  }
  
  // 2. 清除本地数据
  resetAllStores();
  localStorage.removeItem('refreshToken');
  
  // 3. 跳转登录页
  await router.replace({
    path: '/auth/login',
    query: { redirect: encodeURIComponent(currentPath) }
  });
}
```

#### 后端处理

```java
@PostMapping("/auth/logout")
public HttpResult<String> logout(HttpServletRequest request) {
    Long userId = RequestUtils.getCurrentUserIdSafely(request);
    
    if (userId != null) {
        // ✅ 从 Redis 删除 Refresh Token
        jwtUtils.deleteRefreshToken(userId);
        log.info("用户 {} 已登出", userId);
    }
    
    return HttpResult.ok("登出成功");
}
```

**请求示例**：

```json
curl -X POST http://localhost:8080/auth/logout \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

------

## 七、核心优势对比

### 7.1 改造前后对比

| 维度             | 改造前（单 Token）   | 改造后（双 Token）                         |
| :--------------- | :------------------- | :----------------------------------------- |
| **Token 有效期** | 1小时                | Access Token: 30分钟<br>Refresh Token: 7天 |
| **安全性**       | 泄露后可长时间滥用   | Access Token 短期自然失效                  |
| **用户体验**     | 频繁要求重新登录     | 无感刷新，7天内无需登录                    |
| **可控性**       | 无法主动撤销         | Refresh Token 可从 Redis 删除              |
| **并发刷新**     | 多个请求可能重复刷新 | 防并发机制，复用同一个 Promise             |
| **存储方式**     | 仅内存               | Redis 持久化 + LocalStorage                |

### 7.2 性能对比

```
单 Token 方案（1小时过期）：
- 用户每小时需重新登录：1次
- 每天登录次数：24次（工作8小时 = 8次）

双 Token 方案（AT 30分钟，RT 7天）：
- Access Token 自动刷新：16次/天（每30分钟1次）
- 用户手动登录：1次/7天
- 体验提升：99.4%（8次/天 → 1次/周）
```

------

## 八、监控与验证

### 8.1 Redis 数据验证

```dockerfile
# 登录后查看 Redis
redis-cli

# 查看所有 Refresh Token
127.0.0.1:6379> KEYS refresh:*
1) "refresh:1"
2) "refresh:2"

# 查看具体 Token
127.0.0.1:6379> GET refresh:1
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# 查看剩余时间（秒）
127.0.0.1:6379> TTL refresh:1
(integer) 604612  # 约7天

# 删除 Token（模拟登出）
127.0.0.1:6379> DEL refresh:1
(integer) 1
```

### 8.2 日志监控

**后端日志**：

```
2025-01-27 10:00:00 INFO  - 用户认证成功: userId=1, username=admin
2025-01-27 10:30:05 WARN  - Access Token 验证失败: JWT expired
2025-01-27 10:30:06 INFO  - Access Token 刷新成功: userId=1
2025-01-27 11:00:00 INFO  - 用户 1 已登出
```

**前端日志（开发环境）**：

```java
// request.ts 中添加日志
console.log('✅ [Auth] 登录成功，存储 Token');
console.log('🔄 [Auth] Access Token 过期，开始刷新');
console.log('✅ [Auth] Token 刷新成功，重试原请求');
console.log('❌ [Auth] Refresh Token 失效，跳转登录');
```

### 8.3 前端调试工具

```tsx
// 在浏览器控制台使用
// 查看当前 Token
localStorage.getItem('accessToken');
localStorage.getItem('refreshToken');

// 手动触发刷新
import { refreshTokenApi } from '#/api';
const rt = localStorage.getItem('refreshToken');
const { accessToken } = await refreshTokenApi(rt);
console.log('新 Access Token:', accessToken);

// 模拟 Token 过期
localStorage.setItem('accessToken', 'invalid-token');
// 发起任意请求，触发自动刷新
```