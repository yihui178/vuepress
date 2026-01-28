---
title: 菜单控制器MenuController
date: 2025-11-20
tags:
 - Springboot
categories:
 - 项目实战
 - 练习
---

# 菜单控制器（MenuController）文档

------

## 1. 前言

在现代前后端分离的系统中，前端路由通常不是写死在代码中的，而是根据用户的权限**动态生成**。这样可以实现：

- 不同角色看到不同的菜单
- 权限控制更灵活（后端统一管理）-
- 无需修改前端代码即可调整菜单结构如果每个项目都单独实现菜单树的构建逻辑，会导致代码重复率高，维护困难。



**MenuController** 作为系统的菜单管理中心，统一管理：

​	根据用户角色获取权限菜单

​	构建树形菜单结构

​	兼容前端框架（Vben Admin）的路由格式

​	支持外链、iframe、重定向等特殊菜单类型

​	通过统一的菜单接口，前端可以实现**完全动态的路由系统**，提高系统的灵活性和安全性。



## 2.添加核心依赖

确保 `pom.xml` 中包含以下依赖：

```xml
<!-- Spring Boot Web -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
</dependency>
<!-- JWT 工具（用于解析 Token） -->
<dependency>
    <groupId>io.jsonwebtoken</groupId>
    <artifactId>jjwt-api</artifactId>
    <version>0.11.5</version>
</dependency>
<!-- MyBatis Plus（用于数据库查询） -->
<dependency>
    <groupId>com.baomidou</groupId>
    <artifactId>mybatis-plus-boot-starter</artifactId>
    <version>3.5.3.1</version>
</dependency>
<!-- Jackson（用于解析 extra 字段的 JSON） -->
<dependency>
    <groupId>com.fasterxml.jackson.core</groupId>
    <artifactId>jackson-databind</artifactId>
</dependency>
```

## 3. 创建 MenuController 控制器

在 `controller` 包下创建 `MenuController.java`：

```java
package com.example.mybatis.controller;

import com.example.mybatis.entity.Permission;
import com.example.mybatis.http.HttpResult;
import com.example.mybatis.service.PermissionService;
import com.example.mybatis.service.RolePermissionService;
import com.example.mybatis.service.UserRoleService;
import com.example.mybatis.utils.JwtUtils;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpServletRequest;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 菜单控制器
 * 提供动态路由菜单接口，兼容 Vben Admin 前端框架
 */
@RestController
@RequestMapping("/menu")
public class MenuController {

    @Autowired
    private JwtUtils jwtUtils;

    @Autowired
    private UserRoleService userRoleService;

    @Autowired
    private RolePermissionService rolePermissionService;

    @Autowired
    private PermissionService permissionService;

    private static final ObjectMapper JSON = new ObjectMapper();

    /**
     * 获取用户菜单树（Vben Admin 兼容格式）
     * 
     * @param request HTTP 请求（从 Header 中提取 Token）
     * @return 树形菜单结构
     */
    @GetMapping("/all")
    public HttpResult<List<Map<String, Object>>> getAllMenus(HttpServletRequest request) {
        try {
            // 1. 从 Token 中提取用户 ID
            Long userId = getUserIdFromToken(request);
            if (userId == null) {
                return HttpResult.error(401, "Token 无效或缺失");
            }

            // 2. 查询用户的角色列表
            List<Long> roleIds = userRoleService.listRoleIdsByUserId(userId);
            if (roleIds.isEmpty()) {
                return HttpResult.ok(Collections.emptyList());
            }

            // 3. 根据角色查询权限 ID 列表
            List<Long> permIds = rolePermissionService.listPermissionIdsByRoleIds(roleIds);
            if (permIds.isEmpty()) {
                return HttpResult.ok(Collections.emptyList());
            }

            // 4. 查询权限详情（只保留 type='menu' 的权限）
            List<Permission> perms = permissionService.listByIds(permIds).stream()
                    .filter(p -> "menu".equalsIgnoreCase(p.getType()))  // 只要菜单类型
                    .sorted(Comparator.comparingInt(Permission::getOrderNum))  // 按排序号排序
                    .collect(Collectors.toList());

            // 5. 构建 ID -> Node 的映射表
            Map<Long, Map<String, Object>> nodeMap = new LinkedHashMap<>();
            for (Permission p : perms) {
                nodeMap.put(p.getId(), buildNode(p));
            }

            // 6. 构建树形结构（根据 parentId 关联）
            List<Map<String, Object>> roots = new ArrayList<>();
            for (Permission p : perms) {
                Map<String, Object> node = nodeMap.get(p.getId());
                
                if (p.getParentId() == null) {
                    // 顶级菜单
                    roots.add(node);
                } else {
                    // 子菜单，挂载到父节点的 children 下
                    Map<String, Object> parent = nodeMap.get(p.getParentId());
                    if (parent != null) {
                        @SuppressWarnings("unchecked")
                        List<Map<String, Object>> children = (List<Map<String, Object>>) parent.get("children");
                        children.add(node);
                    } else {
                        // 如果找不到父节点，作为顶级菜单处理
                        roots.add(node);
                    }
                }
            }

            return HttpResult.ok(roots);

        } catch (Exception e) {
            e.printStackTrace();
            return HttpResult.error(500, "加载菜单失败：" + e.getMessage());
        }
    }

    /**
     * 构建单个菜单节点（Vben Admin 格式）
     * 
     * @param p 权限对象
     * @return 菜单节点 Map
     */
    private Map<String, Object> buildNode(Permission p) {
        Map<String, Object> node = new LinkedHashMap<>();
        
        // 基础字段
        node.put("id", p.getId());
        node.put("name", p.getName());
        node.put("path", p.getPath().startsWith("/") ? p.getPath() : "/" + p.getPath());

        // 解析 extra 字段（支持 JSON、redirect:、frameSrc: 等）
        Map<String, Object> extra = parseExtra(p.getExtra());

        // 计算 component（BasicLayout / IFrameView / 页面组件）
        String component = resolveComponent(p, extra);
        node.put("component", component);

        // meta 信息（用于前端展示）
        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("title", p.getName());
        meta.put("icon", Optional.ofNullable(p.getIcon()).orElse("lucide:menu"));
        meta.put("code", p.getCode());
        
        // 如果是外链，添加 link 字段
        if (extra.containsKey("link")) {
            meta.put("link", extra.get("link"));
        }
        
        node.put("meta", meta);
        node.put("extra", extra);
        node.put("children", new ArrayList<>());

        return node;
    }

    /**
     * 根据类型和 extra 自动选择 component
     * 
     * @param p 权限对象
     * @param extra 解析后的 extra 字段
     * @return component 名称
     */
    private String resolveComponent(Permission p, Map<String, Object> extra) {
        String c = p.getComponent();
        
        // 顶级菜单：使用 BasicLayout（Vben Admin 主布局）
        if (p.getParentId() == null) {
            return (c != null && !c.isBlank() && !"LAYOUT".equalsIgnoreCase(c))
                    ? trimLeadingSlash(c)
                    : "BasicLayout";
        }

        // 外链或 iframe 优先使用 IFrameView
        if ("IFrameView".equalsIgnoreCase(c) || extra.containsKey("link")) {
            return "IFrameView";
        }

        // 其他情况返回原始 component
        return trimLeadingSlash(Optional.ofNullable(c).orElse(""));
    }

    /**
     * 解析 extra 字段（支持多种格式）
     * 
     * 支持的格式：
     * 1. JSON：{"redirect": "/home", "link": "https://xxx"}
     * 2. 简单格式：redirect:/home
     * 3. 键值对：frameSrc:https://xxx;key2:value2
     * 
     * @param extraStr extra 字段原始字符串
     * @return 解析后的 Map
     */
    private Map<String, Object> parseExtra(String extraStr) {
        Map<String, Object> extra = new LinkedHashMap<>();
        if (extraStr == null || extraStr.isBlank()) {
            return extra;
        }

        try {
            // 1. 尝试解析为 JSON
            if (extraStr.startsWith("{")) {
                extra = JSON.readValue(extraStr, Map.class);
            }
            // 2. 解析 redirect: 格式
            else if (extraStr.startsWith("redirect:")) {
                extra.put("redirect", extraStr.substring("redirect:".length()));
            }
            // 3. 解析 key:value; 格式
            else if (extraStr.contains("frameSrc:") || extraStr.contains(":")) {
                String[] parts = extraStr.split(";");
                for (String p : parts) {
                    if (p.contains(":")) {
                        String[] kv = p.split(":", 2);
                        extra.put(kv[0].trim(), kv[1].trim());
                    }
                }
            }
        } catch (Exception ignored) {
            // 解析失败时返回空 Map
        }

        return extra;
    }

    /**
     * 从 Authorization 请求头提取用户 ID
     * 
     * @param request HTTP 请求
     * @return 用户 ID，如果 Token 无效则返回 null
     */
    private Long getUserIdFromToken(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) {
            return null;
        }

        String token = header.substring(7);  // 去掉 "Bearer " 前缀
        
        try {
            return jwtUtils.parseUserId(token);
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * 去除字符串开头的斜杠
     */
    private String trimLeadingSlash(String s) {
        if (s == null) return null;
        return s.startsWith("/") ? s.substring(1) : s;
    }
}
```

## 4. 数据库表结构

### 4.1 权限表（permission）



```mysql
CREATE TABLE `permission` (
  `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '权限ID',
  `name` VARCHAR(50) NOT NULL COMMENT '权限名称',
  `code` VARCHAR(100) COMMENT '权限编码（如 user:add）',
  `type` VARCHAR(20) DEFAULT 'menu' COMMENT '类型：menu=菜单, button=按钮',
  `path` VARCHAR(200) COMMENT '路由路径',
  `component` VARCHAR(200) COMMENT '组件路径',
  `icon` VARCHAR(50) COMMENT '图标',
  `parent_id` BIGINT COMMENT '父级ID',
  `order_num` INT DEFAULT 0 COMMENT '排序号',
  `extra` TEXT COMMENT '扩展信息（JSON格式）',
  PRIMARY KEY (`id`)
) COMMENT='权限表';
```

**示例数据**：

```mysql
INSERT INTO `permission` VALUES 
(1, '系统管理', 'system', 'menu', '/system', 'BasicLayout', 'lucide:settings', NULL, 1, NULL),
(2, '用户管理', 'system:user', 'menu', '/system/user', '/system/user/index', 'lucide:users', 1, 2, NULL),
(3, '新增用户', 'system:user:add', 'button', NULL, NULL, NULL, 2, 3, NULL),
(4, '外部链接', 'external:baidu', 'menu', '/external/baidu', 'IFrameView', 'lucide:link', NULL, 4, '{"link":"https://www.baidu.com"}');
```

### 4.2 用户角色表（user_role）

```mysql
CREATE TABLE `user_role` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL COMMENT '用户ID',
  `role_id` BIGINT NOT NULL COMMENT '角色ID',
  PRIMARY KEY (`id`)
) COMMENT='用户角色关联表';
```

### 4.3 角色权限表（role_permission）

```mysql
CREATE TABLE `role_permission` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `role_id` BIGINT NOT NULL COMMENT '角色ID',
  `permission_id` BIGINT NOT NULL COMMENT '权限ID',
  PRIMARY KEY (`id`)
) COMMENT='角色权限关联表';
```

## 5. Service 层实现

### 5.1 UserRoleService

```json
@Service
public class UserRoleService {
    @Autowired
    private UserRoleMapper userRoleMapper;

    /**
     * 根据用户 ID 查询角色 ID 列表
     */
    public List<Long> listRoleIdsByUserId(Long userId) {
        return userRoleMapper.selectList(
            new QueryWrapper<UserRole>().eq("user_id", userId)
        ).stream()
        .map(UserRole::getRoleId)
        .collect(Collectors.toList());
    }
}
```

### 5.2 RolePermissionService

```java
@Service
public class RolePermissionService {
    @Autowired
    private RolePermissionMapper rolePermissionMapper;

    /**
     * 根据角色 ID 列表查询权限 ID 列表
     */
    public List<Long> listPermissionIdsByRoleIds(List<Long> roleIds) {
        return rolePermissionMapper.selectList(
            new QueryWrapper<RolePermission>().in("role_id", roleIds)
        ).stream()
        .map(RolePermission::getPermissionId)
        .distinct()  // 去重
        .collect(Collectors.toList());
    }
}
```

## 6. 测试接口

### 6.1 获取菜单树

**请求**：

```json
GET http://localhost:8080/menu/all
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**响应（成功）**：

```json
{
  "code": 200,
  "msg": "操作成功",
  "data": [
    {
      "id": 1,
      "name": "系统管理",
      "path": "/system",
      "component": "BasicLayout",
      "meta": {
        "title": "系统管理",
        "icon": "lucide:settings",
        "code": "system"
      },
      "extra": {},
      "children": [
        {
          "id": 2,
          "name": "用户管理",
          "path": "/system/user",
          "component": "system/user/index",
          "meta": {
            "title": "用户管理",
            "icon": "lucide:users",
            "code": "system:user"
          },
          "extra": {},
          "children": []
        }
      ]
    },
    {
      "id": 4,
      "name": "外部链接",
      "path": "/external/baidu",
      "component": "IFrameView",
      "meta": {
        "title": "外部链接",
        "icon": "lucide:link",
        "code": "external:baidu",
        "link": "https://www.baidu.com"
      },
      "extra": {
        "link": "https://www.baidu.com"
      },
      "children": []
    }
  ]
}
```

**响应（Token 无效）**：

```json
{
  "code": 401,
  "msg": "Token 无效或缺失",
  "data": null
}
```

### 6.2 前端使用示例（Vben Admin）

```js
// src/api/menu.ts
import { request } from '@/utils/request';

export function getMenuList() {
  return request({
    url: '/menu/all',
    method: 'GET',
  });
}
```

```js
// src/store/modules/permission.ts
import { getMenuList } from '@/api/menu';

export const usePermissionStore = defineStore('permission', {
  actions: {
    async generateRoutes() {
      const res = await getMenuList();
      const routes = res.data;
      
      // 将后端返回的菜单转换为前端路由
      this.routes = routes;
      return routes;
    },
  },
});
```

## 7. extra 字段解析规则

`extra` 字段用于存储菜单的扩展配置，支持多种格式，灵活性高。

**7.1 支持的格式**

| 格式类型       | 示例                                              | 解析结果                                         |
| -------------- | ------------------------------------------------- | ------------------------------------------------ |
| **JSON 格式**  | `{"redirect":"/home","link":"https://baidu.com"}` | `{redirect: "/home", link: "https://baidu.com"}` |
| **简单重定向** | `redirect:/home`                                  | `{redirect: "/home"}`                            |
| **键值对格式** | `frameSrc:https://xxx;hideMenu:true`              | `{frameSrc: "https://xxx", hideMenu: "true"}`    |
| **空值**       | `null` 或 `""`                                    | `{}`                                             |



**7.2 常用配置项**

| 字段名                 | 类型    | 说明                            | 示例                                  |
| ---------------------- | ------- | ------------------------------- | ------------------------------------- |
| **redirect**           | String  | 重定向路径                      | `{"redirect": "/dashboard"}`          |
| **link**               | String  | 外部链接地址（配合 IFrameView） | `{"link": "https://www.baidu.com"}`   |
| **frameSrc**           | String  | iframe 地址（同 link）          | `{"frameSrc": "https://example.com"}` |
| **hideMenu**           | Boolean | 是否隐藏菜单                    | `{"hideMenu": true}`                  |
| **hideChildrenInMenu** | Boolean | 是否隐藏子菜单                  | `{"hideChildrenInMenu": true}`        |
| **keepAlive**          | Boolean | 是否缓存页面                    | `{"keepAlive": true}`                 |
| **target**             | String  | 打开方式（_blank / _self）      | `{"target": "_blank"}`                |

**7.3 示例场景**

外部链接（在 iframe 中打开）

```sql
**数据库配置**：
INSERT INTO `permission` VALUES 
(10, 'Vue 官网', 'external:vue', 'menu', '/external/vue', 'IFrameView', 'lucide:link', NULL, 10, 
 '{"link":"https://cn.vuejs.org"}');
```

**返回结果**：

```json
{
  "id": 10,
  "name": "Vue 官网",
  "path": "/external/vue",
  "component": "IFrameView",
  "meta": {
    "title": "Vue 官网",
    "icon": "lucide:link",
    "code": "external:vue",
    "link": "https://cn.vuejs.org"
  },
  "extra": {
    "link": "https://cn.vuejs.org"
  },
  "children": []
}
```

## 8. 总结

通过封装 **MenuController**，我们实现了：

-  根据用户角色动态生成菜单树
-  兼容 Vben Admin 等前端框架的路由格式
-  支持外链、iframe、重定向等特殊菜单类型
-  灵活的 extra 扩展字段解析

**关键收益**：

-  前端无需写死路由，完全由后端控制
-  权限变更无需修改前端代码
-  支持多种菜单类型（内部页面、外链、iframe）
-  通过 extra 字段实现高度定制化

