---
title: JWT工具类（JwtUtils）文档
date: 2025-11-03
tags:
 - JwtUtils
 - Springboot
categories:
 - 项目实战
 - 练习
---

------

# JWT 工具类（JwtUtils）文档

## 1. 前言

在现代 Web 应用中，传统的 Session 认证方式存在跨域、分布式部署困难等问题。**JWT（JSON Web Token）** 作为一种无状态的认证方案，已成为主流选择。

如果每个接口都单独处理 Token 的生成、解析、校验逻辑，会导致代码重复率高，维护困难。

**JwtUtils** 作为系统的 JWT 工具类，统一管理：

- Token 的生成（携带用户 ID、用户名、角色）
- Token 的解析与校验
- Token 的刷新机制
- 从 Token 中提取用户信息

通过统一的工具类，所有需要 JWT 认证的业务都可以复用相同的逻辑，提高代码的可维护性和安全性。

## 2. 添加核心依赖

确保 `pom.xml` 中包含以下依赖：

```xml
<!-- JJWT Core -->
<dependency>
    <groupId>io.jsonwebtoken</groupId>
    <artifactId>jjwt-api</artifactId>
    <version>0.11.5</version>
</dependency>
<!-- JJWT Implementation -->
<dependency>
    <groupId>io.jsonwebtoken</groupId>
    <artifactId>jjwt-impl</artifactId>
    <version>0.11.5</version>
    <scope>runtime</scope>
</dependency>
<!-- JJWT Jackson 序列化支持 -->
<dependency>
    <groupId>io.jsonwebtoken</groupId>
    <artifactId>jjwt-jackson</artifactId>
    <version>0.11.5</version>
    <scope>runtime</scope>
</dependency>
```

## 3. 创建 JwtUtils 工具类

在 `utils` 包下创建 `JwtUtils.java`：



```java
package com.example.mybatis.utils;
import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.util.Date;
import java.util.List;
/**
 * JWT 工具类
 * 提供 Token 的生成、解析、校验功能
 */
@Component
public class JwtUtils {
    private final Key signingKey;
    private final long expireMs;
    /**
     * 构造函数：从配置文件读取密钥和过期时间
     */
    public JwtUtils(
            @Value("${jwt.secret}") String secret,
            @Value("${jwt.expire-ms:3600000}") long expireMs
    ) {
        // 将密钥转换为 HMAC-SHA256 签名密钥
        this.signingKey = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expireMs = expireMs;
    }
    /**
     * 生成 JWT Token
     * @param userId 用户ID
     * @param username 用户名
     * @param roles 角色列表
     * @return JWT Token 字符串
     */
    public String generateToken(Long userId, String username, List<String> roles) {
        Date now = new Date();
        Date expiration = new Date(now.getTime() + expireMs);
        return Jwts.builder()
                // 设置主题（通常是用户名）
                .setSubject(username)
                // 添加自定义声明
                .claim("userId", userId)
                .claim("roles", roles)
                // 设置签发时间
                .setIssuedAt(now)
                // 设置过期时间
                .setExpiration(expiration)
                // 使用 HMAC-SHA256 算法签名
                .signWith(signingKey, SignatureAlgorithm.HS256)
                .compact();
    }
    /**
     * 解析 Token 获取 Claims（负载信息）
     * @param token JWT Token
     * @return Claims 对象
     * @throws JwtException Token 无效或已过期
     */
    public Claims parseClaims(String token) {
        return Jwts.parserBuilder()
                .setSigningKey(signingKey)
                .build()
                .parseClaimsJws(token)
                .getBody();
    }
    /**
     * 从 Token 中提取用户 ID
     * @param token JWT Token
     * @return 用户ID
     */
    public Long parseUserId(String token) {
        Claims claims = parseClaims(token);
        Object userIdObj = claims.get("userId");
        // 兼容多种数据类型
        if (userIdObj instanceof Number) {
            return ((Number) userIdObj).longValue();
        }
        if (userIdObj instanceof String) {
            return Long.valueOf((String) userIdObj);
        }
        return null;
    }
    /**
     * 从 Token 中提取用户名
     * @param token JWT Token
     * @return 用户名
     */
    public String parseUsername(String token) {
        Claims claims = parseClaims(token);
        return claims.getSubject();
    }
    /**
     * 从 Token 中提取角色列表
     * @param token JWT Token
     * @return 角色列表
     */
    @SuppressWarnings("unchecked")
    public List<String> parseRoles(String token) {
        Claims claims = parseClaims(token);
        return (List<String>) claims.get("roles");
    }
    /**
     * 校验 Token 是否有效
     * @param token JWT Token
     * @return true-有效，false-无效
     */
    public boolean validateToken(String token) {
        try {
            parseClaims(token);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }
    /**
     * 检查 Token 是否即将过期（剩余时间少于 5 分钟）
     * @param token JWT Token
     * @return true-即将过期，false-时间充足
     */
    public boolean isTokenExpiringSoon(String token) {
        Claims claims = parseClaims(token);
        Date expiration = claims.getExpiration();
        long timeLeft = expiration.getTime() - System.currentTimeMillis();
        return timeLeft < 5 * 60 * 1000; // 5 分钟
    }
}

```

------

## 4. 在配置文件中配置 JWT 参数

在 `application.yml` 中添加：



```yaml
jwt:
  # JWT 密钥（生产环境必须使用强密钥，长度至少 32 字符）
  secret: replace_with_real_secret_at_deploy_time_1234567890_abcdefg
  # Token 过期时间（单位：毫秒，默认 1 小时）
  expire-ms: 3600000
```

**安全建议**：

- 生产环境使用随机生成的强密钥
- 密钥长度不少于 32 个字符
- 不要将密钥提交到代码仓库

------

## 5. 在 Controller 或 Service 中使用

**5.1 登录时生成 Token**



```java
@RestController
@RequestMapping("/auth")
public class AuthController {
    @Autowired
    private JwtUtils jwtUtils;
    @Autowired
    private UserService userService;
    @PostMapping("/login")
    public HttpResult<LoginResp> login(@RequestBody LoginReq req) {
        // 1. 校验用户名和密码
        User user = userService.getUserByName(req.getName());
        if (user == null || !PasswordUtils.verify(req.getPassword(), user.getPassword())) {
            return HttpResult.error(401, "用户名或密码错误");
        }
        // 2. 查询用户角色
        List<String> roles = userService.getRoleCodes(user.getId());
        // 3. 生成 Token
        String token = jwtUtils.generateToken(user.getId(), user.getName(), roles);
        // 4. 返回结果
        LoginResp resp = new LoginResp(token, user);
        return HttpResult.ok(resp);
    }
}
```

------

**5.2 从请求头解析 Token**



```java
@GetMapping("/userinfo")
public HttpResult<User> getUserInfo(HttpServletRequest request) {
    // 1. 从请求头获取 Token
    String authHeader = request.getHeader("Authorization");
    if (authHeader == null || !authHeader.startsWith("Bearer ")) {
        return HttpResult.error(401, "未登录");
    }
    String token = authHeader.substring(7); // 去掉 "Bearer " 前缀
    // 2. 解析 Token 获取用户 ID
    Long userId = jwtUtils.parseUserId(token);
    // 3. 查询用户信息
    User user = userService.getById(userId);
    return HttpResult.ok(user);
}
```

------

**5.3 刷新 Token**



```java
@PostMapping("/refreshToken")
public HttpResult<LoginResp> refreshToken(@RequestParam String token) {
    try {
        // 1. 解析旧 Token
        Long userId = jwtUtils.parseUserId(token);
        String username = jwtUtils.parseUsername(token);
        // 2. 查询最新角色信息
        List<String> roles = userService.getRoleCodes(userId);
        // 3. 生成新 Token
        String newToken = jwtUtils.generateToken(userId, username, roles);
        // 4. 返回新 Token
        User user = userService.getById(userId);
        return HttpResult.ok(new LoginResp(newToken, user));
    } catch (JwtException e) {
        return HttpResult.error(401, "Token 无效或已过期");
    }
}
```

------

## 6. 全局异常处理

创建全局异常处理器统一处理 JWT 异常：

```java
package com.example.mybatis.exception;
import com.example.mybatis.http.HttpResult;
import io.jsonwebtoken.JwtException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
@RestControllerAdvice
public class GlobalExceptionHandler {
    /**
     * 处理 JWT 异常
     */
    @ExceptionHandler(JwtException.class)
    public HttpResult<?> handleJwtException(JwtException e) {
        return HttpResult.error(401, "Token 无效或已过期");
    }
    /**
     * 处理其他异常
     */
    @ExceptionHandler(Exception.class)
    public HttpResult<?> handleException(Exception e) {
        e.printStackTrace();
        return HttpResult.error(500, "服务器内部错误");
    }
}
```

------

## 7. 测试接口

**7.1 登录生成 Token**

**请求**：



```json
POST http://localhost:8080/auth/login
Content-Type: application/json
{
  "name": "admin",
  "password": "123456"
}
```

**响应（成功）**：



```json
{
  "code": 200,
  "msg": "操作成功",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsInVzZXJJZCI6MSwicm9sZXMiOlsiYWRtaW4iXSwiaWF0IjoxNzEwMDAwMDAwLCJleHAiOjE3MTAwMDM2MDB9.xyz123...",
    "user": {
      "id": 1,
      "name": "admin",
      "avatar": "/avatar/admin.png",
      "roles": ["admin"]
    }
  }
}
```

**Token 结构解析**：

JWT Token 由三部分组成（用 `.` 分隔）：

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9        ← Header（头部）
.
eyJzdWIiOiJhZG1pbiIsInVzZXJJZCI6MSwiY...    ← Payload（负载）
.
xyz123...                                    ← Signature（签名）
```

解码后的 **Payload** 内容：

```json
{
  "sub": "admin",           // 用户名
  "userId": 1,              // 用户ID
  "roles": ["admin"],       // 角色列表
  "iat": 1710000000,        // 签发时间（Unix 时间戳）
  "exp": 1710003600         // 过期时间（Unix 时间戳）
}
```

------

**7.2 解析 Token 获取用户信息**

**请求**：

```json
GET http://localhost:8080/auth/userinfo
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**响应（成功）**：

```json
{
  "code": 200,
  "msg": "操作成功",
  "data": {
    "id": 1,
    "name": "admin",
    "email": "admin@example.com",
    "avatar": "/avatar/admin.png"
  }
}
```

**响应（Token 无效）**：

```json
{
  "code": 401,
  "msg": "Token 无效或已过期",
  "data": null
}
```

------

**7.3 刷新 Token**

**请求**：



```
POST http://localhost:8080/auth/refreshToken
Content-Type: application/x-www-form-urlencoded
token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**响应（成功）**：



```
{
  "code": 200,
  "msg": "操作成功",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.NEW_TOKEN...",
    "user": {
      "id": 1,
      "name": "admin",
      "avatar": "/avatar/admin.png",
      "roles": ["admin"]
    }
  }
}
```

------

**7.4 校验 Token 是否有效**

**请求**：



```
POST http://localhost:8080/auth/validateToken
Content-Type: application/x-www-form-urlencoded

token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**响应（有效）**：



```
{
  "code": 200,
  "msg": "Token 有效",
  "data": true
}
```

**响应（无效）**：



```
{
  "code": 200,
  "msg": "Token 无效",
  "data": false
}
```

------

## 8. 注意事项

**8.1 密钥安全**

- **jwt.secret 必须不少于 32 位字符** 否则 JJWT 会报错：`The signing key's size is too short`

-  **生产环境使用强密钥** 推荐使用随机生成的 Base64 字符串：

  ```
  # Linux/Mac 生成随机密钥openssl rand -base64 64
  ```

-  **不要将密钥提交到代码仓库** 使用环境变量或配置中心管理密钥

------

**8.2 Token 过期时间**

- **默认有效期：1 小时**（3600000 毫秒）
- 可根据业务需求调整 `jwt.expire-ms`
- 建议：
  - 短期 Token：1-2 小时（适合敏感操作）
  - 长期 Token：7-30 天（适合移动端）

------



## 9. 总结

通过封装 **JwtUtils**，我们实现了：

-  统一的 Token 生成逻辑
-  统一的 Token 解析与校验
-  灵活的过期时间配置
-  完善的异常处理机制

这样可以大幅减少代码重复，提高系统的可维护性和安全性。