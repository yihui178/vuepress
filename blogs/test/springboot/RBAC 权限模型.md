---
title: RBAC权限模型
date: 2025-11-18
tags:
 - Springboot
categories:
 - 项目实战
 - 练习
---

# RBAC 权限模型文档

# 1. 前言

前言在企业级应用开发中，权限管理是最核心的功能之一。如果每个功能模块都单独实现权限控制，会导致代码重复率高、权限逻辑混乱、维护困难。

**RBAC（Role-Based Access Control，基于角色的访问控制）** 是目前最成熟的权限管理模型，通过 **用户-角色-权限** 三层解耦，实现了灵活的权限分配。

本系统采用标准的 RBAC 模型，实现了：

- 用户与角色的多对多关系
- 角色与权限的多对多关系- 菜单权限（前端路由）
- 按钮权限（操作级别）
- API 接口权限（后端拦截）

通过统一的权限管理，系统可以实现：

- 不同角色看到不同的菜单
- 不同角色拥有不同的操作权限
- 细粒度的按钮级权限控制
- 动态的权限分配和调整

------

# 2. RBAC 模型总体结构

**2.1 核心关系图**

```css
用户 user
    ↓ 多对多
角色 role
    ↓ 多对多
权限 permission(menu/button/api)
```

**2.2 权限类型说明**

- **type = menu** → 菜单权限（前端菜单）
- **type = button** → 按钮权限（前端按钮、操作权限）
- **type = api** → API 接口权限（可选）

------

# 3. 数据库结构

**user 表**



```sql
CREATE TABLE user (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(30),
    age INT,
    email VARCHAR(50),
    password VARCHAR(255) DEFAULT '123456',
    role VARCHAR(50) DEFAULT 'admin'
);
```

**role 表**



```sql
CREATE TABLE role (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    description VARCHAR(255),
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**permission 表（权限核心）**



```sql
CREATE TABLE permission (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(100) NOT NULL UNIQUE,
    type VARCHAR(20) NOT NULL,           -- menu/button/api
    path VARCHAR(255),
    method VARCHAR(10),
    parent_id BIGINT,
    order_num INT DEFAULT 0,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    component VARCHAR(255)
);
```

**user_role（用户与角色多对多）**



```sql
CREATE TABLE user_role (
    user_id BIGINT,
    role_id BIGINT,
    PRIMARY KEY (user_id, role_id),
    FOREIGN KEY (user_id) REFERENCES user(id),
    FOREIGN KEY (role_id) REFERENCES role(id)
);
```

**role_permission（角色与权限多对多）**



```sql
CREATE TABLE role_permission (
    role_id BIGINT,
    permission_id BIGINT,
    PRIMARY KEY (role_id, permission_id),
    FOREIGN KEY (role_id) REFERENCES role(id),
    FOREIGN KEY (permission_id) REFERENCES permission(id)
);
```

------

# 4. 后端实体类

（仅保留与 RBAC 相关的）

由于你上传的文件中未包含完整实体类 Java 源码，我从你文件中的 SQL 结构整理成可直接使用的实体示例。

**User.java（推导）**



```java
@Data
public class User {
    private Long id;
    private String name;
    private Integer age;
    private String email;
    private String password;
    private String role;     // 初始字段，但最终以 user_role 为主
}
```

**Role.java（推导）**



```java
@Data
public class Role {
    private Long id;
    private String name;
    private String code;
    private String description;
    private LocalDateTime createTime;
}
```

**Permission.java（菜单 / 按钮权限）**

来自你的 SQL（包含 component）



```java
@Data
public class Permission {
    private Long id;
    private String name;
    private String code;
    private String type;        // menu、button、api
    private String path;
    private String method;
    private Long parentId;
    private Integer orderNum;
    private String component;   // 对应前端 vue 文件路径
}
```

------

# 5. 后端关联关系（UserRole / RolePermission）

根据 SQL：

```java
@Data
public class UserRole {
    private Long userId;
    private Long roleId;
}

@Data
public class RolePermission {
    private Long roleId;
    private Long permissionId;
}
```

------

# 6. 权限下发接口（AuthController）



**/auth/access —— 获取按钮权限**

接口返回 accessCodes：

```json
{
  "accessCodes": ["user:add", "user:delete", "course:publish"]
}
```



**/auth/user —— 获取用户详情 + 角色**

前端调用：

```ts
const userInfo = userStore.userInfo || (await authStore.fetchUserInfo());
```

------

# 7. 权限返回结构 （AuthAccessVO）



```java
@Data
public class AuthAccessVO {
    private String accessToken;
    private List<String> accessCodes;  // 按钮权限 code
    private List<String> roles;        // 用户角色 code
}
```

------

# 8. 后端权限查询逻辑（核心）



**查询用户所有角色**



```sql
SELECT r.code
FROM user_role ur
JOIN role r ON r.id = ur.role_id
WHERE ur.user_id = :uid;
```

**查询用户所有权限（按钮权限）**



```sql
SELECT DISTINCT p.code
FROM role_permission rp
JOIN permission p ON p.id = rp.permission_id
WHERE rp.role_id IN (SELECT role_id FROM user_role WHERE user_id = :uid)
  AND p.type = 'button';
```

**查询菜单权限（被 `/menu/all` 使用）**



```sql
SELECT DISTINCT p.*
FROM role_permission rp
JOIN permission p ON p.id = rp.permission_id
WHERE rp.role_id IN (SELECT role_id FROM user_role WHERE user_id = :uid)
  AND p.type = 'menu'
ORDER BY p.order_num;
```

------

# 9. 前端权限系统如何消费权限（access.ts）

前端使用：



```ts
localStorage.setItem('accessCodes', JSON.stringify(res.accessCodes));
```

按钮显示方式：



```vue
<Button v-if="hasPermission('user:add')">新增用户</Button>
```

------

# 10. 菜单权限 vs 按钮权限

| 类型   | 在数据库                   | 用途          | 出现在前端？         |
| ------ | -------------------------- | ------------- | -------------------- |
| menu   | permission.type = 'menu'   | 菜单、路由    | 进入动态菜单         |
| button | permission.type = 'button' | CRUD 按钮权限 | 控制按钮显示         |
| api    | permission.type = 'api'    | 后端接口权限  | 可选，不在前端菜单中 |

------

# 11. 完整权限流转图



```css
用户登录
    ↓
验证 Token
    ↓
查询用户角色 user_role
    ↓
角色 → 权限 role_permission
    ↓
分离 menu 权限 和 button 权限
    ↓
/menu/all         /auth/access
(菜单树)          (按钮权限 accessCodes)
    ↓                    ↓
前端动态路由          按钮 v-permission
生成菜单              控制新增/编辑等按钮
```