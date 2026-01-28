---
title: 登录模块AuthController
date: 2025-11-10
tags:
 - Springboot
categories:
 - 项目实战
 - 练习
---

------

# 登录模块AuthController

##  1. 前言

在日常开发中，用户认证是系统最核心的功能之一。如果每个模块都单独处理登录、权限校验、Token管理等逻辑，会导致代码重复率高，维护困难。

**AuthController** 作为系统的认证中心，统一管理：

- 用户登录/登出
- 验证码校验
- JWT Token 生成与刷新
- 权限码获取
- 动态路由菜单构建

通过统一的认证接口，所有需要鉴权的业务都可以基于 Token 进行身份验证和权限控制

## 2. 添加核心

依赖确保 `pom.xml` 中包含以下依赖：

```xml
<!-- JWT Token 生成与解析 -->
<dependency>
    <groupId>io.jsonwebtoken</groupId>
    <artifactId>jjwt-api</artifactId>
    <version>0.11.5</version>
</dependency>
<dependency>
    <groupId>io.jsonwebtoken</groupId>
    <artifactId>jjwt-impl</artifactId>
    <version>0.11.5</version>
</dependency>
<dependency>
    <groupId>io.jsonwebtoken</groupId>
    <artifactId>jjwt-jackson</artifactId>
    <version>0.11.5</version>
</dependency>
<!-- 验证码 -->
<dependency>
    <groupId>com.github.penggle</groupId>
    <artifactId>kaptcha</artifactId>
    <version>2.3.2</version>
</dependency>
<!-- Spring Security（可选，用于密码加密） -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-security</artifactId>
</dependency>
```

------

## 3. 创建 AuthController 控制器

将 AuthController 放置在控制器包下，提供以下核心接口：



```java
package com.example.mybatis.controller;
import com.example.mybatis.dto.LoginReq;
import com.example.mybatis.dto.LoginResp;
import com.example.mybatis.dto.CaptchaReq;
import com.example.mybatis.entity.User;
import com.example.mybatis.service.CaptchaService;
import com.example.mybatis.service.UserService;
import com.example.mybatis.service.PermissionService;
import com.example.mybatis.service.MenuService;
import com.example.mybatis.utils.JwtUtils;
import com.example.mybatis.utils.PasswordUtils;
import com.example.mybatis.http.HttpResult;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import io.jsonwebtoken.Claims;
import java.util.List;
@RestController
@RequestMapping("/auth")
public class AuthController {
    @Autowired
    private UserService userService;
    @Autowired
    private CaptchaService captchaService;
    @Autowired
    private JwtUtils jwtUtils;
    @Autowired
    private PermissionService permissionService;
    @Autowired
    private MenuService menuService;
    /**
     * 用户登录接口
     */
    @PostMapping("/login")
    public HttpResult<LoginResp> login(@RequestBody LoginReq req) {
        try {
            // 1. 校验验证码
            boolean captchaValid = captchaService.validate(req.getCaptchaId(), req.getCaptchaCode());
            if (!captchaValid) {
                return HttpResult.error(400, "验证码错误");
            }
            // 2. 查询用户
            User user = userService.getUserByName(req.getName());
            if (user == null) {
                return HttpResult.error(404, "账号不存在");
            }
            // 3. 校验密码
            if (!PasswordUtils.verify(req.getPassword(), user.getPassword())) {
                return HttpResult.error(401, "密码错误");
            }
            // 4. 查询角色
            List<String> roles = userService.getRoleCodes(user.getId());
            // 5. 生成 JWT Token
            String token = jwtUtils.generateToken(user.getId(), user.getName(), roles);
            // 6. 返回结果
            LoginResp resp = new LoginResp(token, user);
            return HttpResult.ok(resp);
        } catch (Exception e) {
            e.printStackTrace();
            return HttpResult.error(500, "登录失败");
        }
    }
    /**
     * 校验验证码接口
     */
    @PostMapping("/verifyCaptcha")
    public HttpResult<?> verifyCaptcha(@RequestBody CaptchaReq req) {
        boolean valid = captchaService.validate(req.getCaptchaId(), req.getCaptchaCode());
        return valid ? HttpResult.ok("验证成功") : HttpResult.error(400, "验证码错误");
    }
    /**
     * 刷新 Token 接口
     */
    @PostMapping("/refreshToken")
    public HttpResult<LoginResp> refreshToken(@RequestParam String token) {
        try {
            // 解析旧 Token
            Claims claims = jwtUtils.parseClaims(token);
            Long userId = jwtUtils.parseUserId(token);
            // 查询用户信息
            User user = userService.getById(userId);
            List<String> roles = userService.getRoleCodes(userId);
            // 生成新 Token
            String newToken = jwtUtils.generateToken(userId, user.getName(), roles);
            LoginResp resp = new LoginResp(newToken, user);
            return HttpResult.ok(resp);
        } catch (Exception e) {
            return HttpResult.error(401, "Token 无效或已过期");
        }
    }
    /**
     * 获取当前用户权限码（按钮级权限）
     */
    @GetMapping("/codes")
    public HttpResult<List<String>> getPermissionCodes() {
        Long userId = jwtUtils.getCurrentUserId();
        List<String> codes = permissionService.getPermissionCodes(userId);
        return HttpResult.ok(codes);
    }
    /**
     * 获取当前用户可访问的路由菜单
     */
    @GetMapping("/access")
    public HttpResult<?> getAccessMenu() {
        Long userId = jwtUtils.getCurrentUserId();
        List<MenuVO> menus = menuService.buildMenus(userId);
        return HttpResult.ok(menus);
    }
    /**
     * 用户登出接口
     */
    @PostMapping("/logout")
    public HttpResult<?> logout() {
        // 可以在这里清除 Redis 中的 Token（如果使用 Redis 存储）
        return HttpResult.ok("退出成功");
    }
}
```

------

## 4. 在 Service 或拦截器中使用

### 4.1 JwtUtils 工具类示例



```java
package com.example.mybatis.utils;
import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Component;
import java.security.Key;
import java.util.Date;
import java.util.List;
@Component
public class JwtUtils {
    private static final String SECRET = "your-256-bit-secret-key-here-must-be-long-enough";
    private static final long EXPIRATION = 7 * 24 * 60 * 60 * 1000; // 7天
    private Key getSigningKey() {
        return Keys.hmacShaKeyFor(SECRET.getBytes());
    }
    /**
     * 生成 JWT Token
     */
    public String generateToken(Long userId, String username, List<String> roles) {
        return Jwts.builder()
                .setSubject(username)
                .claim("userId", userId)
                .claim("roles", roles)
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + EXPIRATION))
                .signWith(getSigningKey(), SignatureAlgorithm.HS256)
                .compact();
    }
    /**
     * 解析 Token 获取 Claims
     */
    public Claims parseClaims(String token) {
        return Jwts.parserBuilder()
                .setSigningKey(getSigningKey())
                .build()
                .parseClaimsJws(token)
                .getBody();
    }
    /**
     * 获取用户ID
     */
    public Long parseUserId(String token) {
        Claims claims = parseClaims(token);
        return claims.get("userId", Long.class);
    }
    /**
     * 从请求头获取当前用户ID（需配合拦截器）
     */
    public Long getCurrentUserId() {
        // 从 ThreadLocal 或请求上下文中获取
        return UserContext.getCurrentUserId();
    }
}
```

------

## 5. 全局异常处理

创建 `GlobalExceptionHandler` 统一处理异常：



```java
package com.example.mybatis.exception;
import com.example.mybatis.http.HttpResult;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
@RestControllerAdvice
public class GlobalExceptionHandler {
    /**
     * 处理参数异常
     */
    @ExceptionHandler(IllegalArgumentException.class)
    public HttpResult<?> handleIllegalArgument(IllegalArgumentException e) {
        return HttpResult.error(400, e.getMessage());
    }
    /**
     * 处理 JWT 异常
     */
    @ExceptionHandler(JwtException.class)
    public HttpResult<?> handleJwtException(JwtException e) {
        return HttpResult.error(401, "Token 无效或已过期");
    }
    /**
     * 处理系统异常
     */
    @ExceptionHandler(Exception.class)
    public HttpResult<?> handleException(Exception e) {
        e.printStackTrace();
        return HttpResult.error(500, "服务器内部错误");
    }
}
```

------

## 6. 配置统一的返回结构

`HttpResult` 类示例：

```json
package com.example.mybatis.http;
public class HttpResult<T> {
    private int code;
    private String msg;
    private T data;
    public static <T> HttpResult<T> ok(T data) {
        HttpResult<T> result = new HttpResult<>();
        result.setCode(200);
        result.setMsg("操作成功");
        result.setData(data);
        return result;
    }
    public static <T> HttpResult<T> error(int code, String msg) {
        HttpResult<T> result = new HttpResult<>();
        result.setCode(code);
        result.setMsg(msg);
        return result;
    }

}
```

------

## 7. 测试接口

### 7.1 登录接口测试

**请求示例（正常情况）**：



```json
POST http://localhost:8080/auth/login
Content-Type: application/json
{
  "name": "admin",
  "password": "123456",
  "captchaId": "DHFJ39",
  "captchaCode": "a9D1"
}
```

**响应（成功）**：



```json
{
  "code": 200,
  "msg": "操作成功",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "name": "admin",
      "avatar": "/avatar/admin.png",
      "roles": ["admin"]
    }
  }
}
```

**响应（验证码错误）**：



```json
{  "code": 400,  "msg": "验证码错误",  "data": null}
```

**响应（密码错误）**：



```json
{  "code": 401,  "msg": "密码错误",  "data": null}
```

------

### 7.2 获取权限码测试

**请求**：



```json
GET http://localhost:8080/auth/codesAuthorization: Bearer <token>
```

**响应**：



```json
{
  "code": 200,
  "msg": "操作成功",
  "data": [
    "user:add",
    "user:delete",
    "menu:view",
    "system:config:update"
  ]
}
```

------

### 7.3 获取路由菜单测试

**请求**：



```json
GET http://localhost:8080/auth/accessAuthorization: Bearer <token>
```

**响应**：



```json
{
  "code": 200,
  "msg": "操作成功",
  "data": [
    {
      "title": "系统管理",
      "path": "/system",
      "children": [
        {
          "path": "/system/user",
          "title": "用户管理",
          "component": "/system/user/index.vue",
          "icon": "ion:user"
        }
      ]
    }
  ]
}
```

------

## 8. 注意事项

1. **验证码必须先通过** - 登录前必须验证验证码，否则直接拦截
2. **Token 放入请求头** - 格式：`Authorization: Bearer <token>`
3. **refreshToken 必须携带旧 token** - 用于解析用户信息重新生成新 token
4. **权限码用于前端按钮级权限控制** - 如 `user:add` 控制"新建用户"按钮是否可见
5. **菜单根据角色动态构建** - 前端不写死路由，而是根据后端返回的菜单数据动态生成

------

## 9. 总结

通过封装 **AuthController**，我们实现了：

-  统一的用户认证入口
-  JWT Token 的生成与管理
-  权限码的动态获取
-  前端路由菜单的动态构建
-  全局异常处理

这样可以大幅减少代码重复，提高系统的可维护性和安全性。
