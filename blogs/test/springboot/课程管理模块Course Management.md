---
title: 课程管理模块Course Management
date: 2025-11-25
tags:
 - Course
 - Highlight
 - Vue3 
 - Springboot
categories:
 - 项目实战
 - 练习
---

# 课程管理模块（Course Management）完整文档

## 1. 前言

在教育培训系统中，课程管理是核心功能之一。一个完善的课程管理系统需要支持：

- **课程的增删改查**

- **课程分类管理**

- **课程亮点（标签）管理**

- **多对多关联关系处理**

- **前后端完整的交互流程**

本模块实现了**课程与亮点的多对多关系管理**，具有以下特点：

- **课程与亮点解耦**：一个课程可以有多个亮点，一个亮点可以被多个课程使用

- **独立的亮点管理**：可以在课程表单中直接管理亮点库

- **关键词搜索**：支持按课程名称或描述搜索

- **分页查询**：使用 PageHelper 实现高性能分页

- **性能优化**：避免 N+1 查询，批量查询关联数据

  

## 2. 数据库设计

### 2.1 课程表（course）

```mysql
CREATE TABLE `course` (
  `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '课程ID',
  `course_name` VARCHAR(20) NOT NULL COMMENT '课程名称',
  `category` VARCHAR(50) NOT NULL COMMENT '课程分类',
  `description` VARCHAR(100) NOT NULL COMMENT '课程描述',
  `online` TINYINT(1) DEFAULT 0 COMMENT '是否线上课程（0-否，1-是）',
  `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课程表';
```

**示例数据**：

```mysql
INSERT INTO `course` VALUES 
(1, 'Java 基础入门', '编程语言', '从零开始学习 Java 编程', 1, NOW(), NOW()),
(2, 'Vue3 实战教程', '前端开发', '深入学习 Vue3 组合式 API', 1, NOW(), NOW()),
(3, 'MySQL 数据库优化', '数据库', '掌握 MySQL 性能调优技巧', 0, NOW(), NOW());
```

------

### 2.2 亮点表（highlight）

```mysql
CREATE TABLE `highlight` (
  `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '亮点ID',
  `name` VARCHAR(20) NOT NULL UNIQUE COMMENT '亮点名称',
  `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课程亮点表';
```

**示例数据**：

```mysql
INSERT INTO `highlight` VALUES 
(1, '实战项目', NOW()),
(2, '名师授课', NOW()),
(3, '高薪就业', NOW()),
(4, '终身复习', NOW()),
(5, '小班教学', NOW());
```

------

### 2.3 课程亮点关联表（course_highlight）

```mysql
CREATE TABLE `course_highlight` (
  `course_id` BIGINT NOT NULL COMMENT '课程ID',
  `highlight_id` BIGINT NOT NULL COMMENT '亮点ID',
  PRIMARY KEY (`course_id`, `highlight_id`),
  FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`highlight_id`) REFERENCES `highlight`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课程亮点关联表';
```

**示例数据**：

```mysql
-- Java 课程有 3 个亮点
INSERT INTO `course_highlight` VALUES (1, 1), (1, 2), (1, 3);
-- Vue3 课程有 2 个亮点
INSERT INTO `course_highlight` VALUES (2, 1), (2, 4);
-- MySQL 课程有 4 个亮点
INSERT INTO `course_highlight` VALUES (3, 1), (3, 2), (3, 3), (3, 5);
```

**关系说明**：

- 一个课程可以有多个亮点（1:N）
- 一个亮点可以被多个课程使用（N:1）
- 最终形成**多对多关系**（M:N）

------

## 3. 后端实现

### 3.1 实体类

**Course.java**

```java
package com.example.mybatis.entity;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.util.List;
/**
 * 课程实体类
 * @author yihui
 */
@Data
@TableName("course")
public class Course {
    /** 课程ID（雪花算法生成） */
    @TableId(value = "id", type = IdType.ASSIGN_ID)
    private Long id;
    
    /** 课程名称 */
    private String courseName;
    
    /** 课程分类 */
    private String category;
    
    /** 课程描述 */
    private String description;
    
    /** 是否线上课程 */
    private Boolean online;
    /** 关联的亮点列表（不在数据库表中，用于多对多关联） */
    @TableField(exist = false)
    private List<Highlight> highlights;
}
```

**Highlight.java**

```java
package com.example.mybatis.entity;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
/**
 * 课程亮点实体类
 * @author yihui
 */
@Data
@TableName("highlight")
public class Highlight {
    
    /** 亮点ID */
    @TableId(value = "id", type = IdType.ASSIGN_ID)
    private Long id;
    
    /** 亮点名称 */
    private String name;
}
```

------

### 3.2 DTO（数据传输对象）

**CourseDTO.java**

```java
package com.example.mybatis.dto;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
/**
 * 课程数据传输对象
 * 用于前后端数据交互
 * @author yihui
 */
@Data
@Schema(description = "课程数据传输对象")
public class CourseDTO {
    
    @Schema(description = "课程ID")
    private Long id;
    @NotBlank(message = "课程名称不能为空")
    @Size(max = 20, message = "课程名称长度不能超过20个字符")
    @Schema(description = "课程名称", example = "Java 基础入门")
    private String courseName;
    @NotBlank(message = "课程分类不能为空")
    @Schema(description = "课程分类", example = "编程语言")
    private String category;
    @NotBlank(message = "课程描述不能为空")
    @Size(max = 100, message = "课程描述长度不能超过100个字符")
    @Schema(description = "课程描述")
    private String description;
    @NotNull(message = "是否线上课程不能为空")
    @Schema(description = "是否线上课程")
    private Boolean online;
    @Schema(description = "亮点ID数组（表单提交）")
    private List<Long> highlightIds;
}
```

**HighlightDTO.java**

```java
package com.example.mybatis.dto;
import lombok.Data;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
/**
 * 亮点数据传输对象
 * @author yihui
 */
@Data
public class HighlightDTO {
    
    private Long id;
    @NotBlank(message = "亮点名称不能为空")
    @Size(max = 20, message = "亮点名称长度不能超过20个字符")
    private String name;
}
```

------

### 3.3 Mapper 层

**CourseMapper.java**

```java
package com.example.mybatis.mapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.example.mybatis.entity.Course;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;
import java.util.Map;
/**
 * Course Mapper 接口
 * @author yihui
 */
@Mapper
public interface CourseMapper extends BaseMapper<Course> {
    /**
     * 根据关键词查询课程（用于分页）
     */
    List<Course> selectByKeyword(@Param("keyword") String keyword);
    /**
     * 删除课程的所有亮点关联
     */
    void deleteHighlightsByCourseId(@Param("courseId") Long courseId);
    /**
     * 插入课程亮点关联
     */
    void insertCourseHighlight(@Param("courseId") Long courseId,
                               @Param("highlightId") Long highlightId);
    /**
     * 批量查询课程的亮点（性能优化，避免 N+1 查询）
     */
    List<Map<String, Object>> selectHighlightsByCourseIds(@Param("courseIds") List<Long> courseIds);
}
```

**HighlightMapper.java**

```java
package com.example.mybatis.mapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.example.mybatis.entity.Highlight;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
/**
 * Highlight Mapper 接口
 * @author yihui
 */
@Mapper
public interface HighlightMapper extends BaseMapper<Highlight> {
    
    /**
     * 查询有多少课程引用了该亮点
     * 用于删除前的校验
     */
    @Select("SELECT COUNT(*) FROM course_highlight WHERE highlight_id = #{highlightId}")
    int countCoursesByHighlightId(@Param("highlightId") Long highlightId);
}
```

------

### 3.4 Mapper XML

**CourseMapper.xml**

```java
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper
        PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN"
        "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.example.mybatis.mapper.CourseMapper">
    <!-- 结果映射 -->
    <resultMap id="CourseResultMap" type="com.example.mybatis.entity.Course">
        <id property="id" column="id"/>
        <result property="courseName" column="course_name"/>
        <result property="category" column="category"/>
        <result property="description" column="description"/>
        <result property="online" column="online"/>
    </resultMap>
    <!-- 根据关键字查询（用于 PageHelper 分页） -->
    <select id="selectByKeyword" resultMap="CourseResultMap" parameterType="java.lang.String">
        SELECT id, course_name, category, description, online
        FROM course
        <where>
            <if test="keyword != null and keyword.trim() != ''">
                (course_name LIKE CONCAT('%', #{keyword}, '%')
                OR description LIKE CONCAT('%', #{keyword}, '%'))
            </if>
        </where>
        ORDER BY id DESC
    </select>
    <!-- 插入课程亮点关联 -->
    <insert id="insertCourseHighlight">
        INSERT INTO course_highlight(course_id, highlight_id)
        VALUES (#{courseId}, #{highlightId})
    </insert>
    <!-- 删除课程的所有亮点关联 -->
    <delete id="deleteHighlightsByCourseId">
        DELETE FROM course_highlight WHERE course_id = #{courseId}
    </delete>
    <!-- 批量查询课程的亮点（性能优化） -->
    <select id="selectHighlightsByCourseIds" resultType="map">
        SELECT ch.course_id, h.id, h.name
        FROM course_highlight ch
        JOIN highlight h ON ch.highlight_id = h.id
        WHERE ch.course_id IN
        <foreach collection="courseIds" item="id" open="(" separator="," close=")">
            #{id}
        </foreach>
    </select>
</mapper>
```

------

### 3.5 Service 层

**CourseService.java**

```java
package com.example.mybatis.service;
import com.baomidou.mybatisplus.extension.service.IService;
import com.example.mybatis.common.HttpResult;
import com.example.mybatis.dto.CourseDTO;
import com.example.mybatis.entity.Course;
import com.github.pagehelper.PageInfo;
import java.util.List;
import java.util.Map;
/**
 * 课程服务接口
 * @author yihui
 */
public interface CourseService extends IService<Course> {
    /**
     * 分页查询课程（返回 DTO，包含亮点信息）
     */
    PageInfo<CourseDTO> pageCoursesWithDTO(int page, int pageSize, String keyword);
    /**
     * 新增课程
     */
    HttpResult<String> addCourse(CourseDTO dto);
    /**
     * 更新课程
     */
    HttpResult<String> updateCourse(CourseDTO dto);
    /**
     * 删除课程
     */
    HttpResult<String> deleteCourse(Long courseId);
    /**
     * 批量查询多个课程的亮点（性能优化）
     */
    Map<Long, List<Long>> getHighlightsByCourseIds(List<Long> courseIds);
}
```

**CourseServiceImpl.java**

```java
package com.example.mybatis.service.impl;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.example.mybatis.common.HttpResult;
import com.example.mybatis.common.SpringException;
import com.example.mybatis.dto.CourseDTO;
import com.example.mybatis.entity.Course;
import com.example.mybatis.entity.Highlight;
import com.example.mybatis.mapper.CourseMapper;
import com.example.mybatis.service.CourseService;
import com.github.pagehelper.PageHelper;
import com.github.pagehelper.PageInfo;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
/**
 * 课程服务实现类
 * @author yihui
 */
@Service
@RequiredArgsConstructor
public class CourseServiceImpl extends ServiceImpl<CourseMapper, Course> implements CourseService {
    private final CourseMapper courseMapper;
    // ========== 查询操作 ==========
    @Override
    public PageInfo<CourseDTO> pageCoursesWithDTO(int page, int pageSize, String keyword) {
        try {
            // 1. 启动分页
            PageHelper.startPage(page, pageSize);
            
            // 2. 查询课程列表
            List<Course> courseList = courseMapper.selectByKeyword(keyword);
            PageInfo<Course> coursePageInfo = new PageInfo<>(courseList);
            
            // 3. 边界处理：空结果
            if (courseList.isEmpty()) {
                return createEmptyPageInfo(coursePageInfo);
            }
            
            // 4. 提取所有课程 ID
            List<Long> courseIds = courseList.stream()
                    .map(Course::getId)
                    .collect(Collectors.toList());
            
            // 5. 批量查询亮点（避免 N+1 问题）
            Map<Long, List<Long>> courseHighlightMap = getHighlightsByCourseIds(courseIds);
            
            // 6. 转换为 DTO
            List<CourseDTO> dtoList = courseList.stream().map(course -> {
                CourseDTO dto = new CourseDTO();
                BeanUtils.copyProperties(course, dto);
                dto.setHighlightIds(
                    courseHighlightMap.getOrDefault(course.getId(), Collections.emptyList())
                );
                return dto;
            }).collect(Collectors.toList());
            
            // 7. 封装分页结果
            PageInfo<CourseDTO> dtoPage = new PageInfo<>();
            dtoPage.setList(dtoList);
            dtoPage.setPageNum(coursePageInfo.getPageNum());
            dtoPage.setPageSize(coursePageInfo.getPageSize());
            dtoPage.setTotal(coursePageInfo.getTotal());
            dtoPage.setPages(coursePageInfo.getPages());
            
            return dtoPage;
            
        } catch (Exception e) {
            throw new SpringException("查询课程分页失败: " + e.getMessage(), 500, e);
        }
    }
    // ========== CUD 操作 ==========
    /**
     * 新增课程
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public HttpResult<String> addCourse(CourseDTO dto) {
        // 1. 参数校验
        validateCourseDTO(dto);
        
        // 2. 转换为实体
        Course course = convertToEntity(dto);
        
        // 3. 保存课程
        boolean success = this.save(course);
        if (!success) {
            return HttpResult.error(500, "新增课程失败");
        }
        
        // 4. 保存课程亮点关联
        saveOrUpdateHighlights(course);
        
        return HttpResult.ok("新增成功");
    }
    /**
     * 更新课程
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public HttpResult<String> updateCourse(CourseDTO dto) {
        // 1. 参数校验
        if (dto.getId() == null) {
            return HttpResult.error(400, "课程ID不能为空");
        }
        
        validateCourseDTO(dto);
        
        // 2. 检查课程是否存在
        Course existingCourse = this.getById(dto.getId());
        if (existingCourse == null) {
            return HttpResult.error(404, "课程不存在");
        }
        
        // 3. 转换为实体
        Course course = convertToEntity(dto);
        
        // 4. 更新课程
        boolean success = this.updateById(course);
        if (!success) {
            return HttpResult.error(500, "更新课程失败");
        }
        
        // 5. 更新课程亮点关联
        saveOrUpdateHighlights(course);
        
        return HttpResult.ok("更新成功");
    }
    /**
     * 删除课程
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public HttpResult<String> deleteCourse(Long courseId) {
        // 1. 参数校验
        if (courseId == null) {
            return HttpResult.error(400, "课程ID不能为空");
        }
        
        // 2. 检查课程是否存在
        Course existingCourse = this.getById(courseId);
        if (existingCourse == null) {
            return HttpResult.error(404, "课程不存在");
        }
        
        // 3. 删除课程（外键级联删除会自动删除关联表数据）
        boolean success = this.removeById(courseId);
        if (!success) {
            return HttpResult.error(500, "删除课程失败");
        }
        
        return HttpResult.ok("删除成功");
    }
    // ========== 辅助方法 ==========
    /**
     * 批量查询课程的亮点
     */
    @Override
    public Map<Long, List<Long>> getHighlightsByCourseIds(List<Long> courseIds) {
        if (courseIds == null || courseIds.isEmpty()) {
            return Collections.emptyMap();
        }
        
        List<Map<String, Object>> highlightMaps = courseMapper.selectHighlightsByCourseIds(courseIds);
        
        return highlightMaps.stream()
                .collect(Collectors.groupingBy(
                        m -> ((Number) m.get("course_id")).longValue(),
                        Collectors.mapping(
                                m -> ((Number) m.get("id")).longValue(),
                                Collectors.toList()
                        )
                ));
    }
    /**
     * 创建空分页结果
     */
    private PageInfo<CourseDTO> createEmptyPageInfo(PageInfo<Course> coursePageInfo) {
        PageInfo<CourseDTO> emptyPage = new PageInfo<>();
        emptyPage.setList(Collections.emptyList());
        emptyPage.setPageNum(coursePageInfo.getPageNum());
        emptyPage.setPageSize(coursePageInfo.getPageSize());
        emptyPage.setTotal(coursePageInfo.getTotal());
        emptyPage.setPages(coursePageInfo.getPages());
        return emptyPage;
    }
    /**
     * DTO 转 Entity
     */
    private Course convertToEntity(CourseDTO dto) {
        Course course = new Course();
        BeanUtils.copyProperties(dto, course);
        
        if (dto.getHighlightIds() != null && !dto.getHighlightIds().isEmpty()) {
            List<Highlight> highlights = dto.getHighlightIds().stream()
                    .map(id -> {
                        Highlight h = new Highlight();
                        h.setId(id);
                        return h;
                    })
                    .collect(Collectors.toList());
            course.setHighlights(highlights);
        }
        
        return course;
    }
    /**
     * 保存或更新课程亮点关联
     */
    private void saveOrUpdateHighlights(Course course) {
        Long courseId = course.getId();
        
        // 1. 删除旧的关联
        courseMapper.deleteHighlightsByCourseId(courseId);
        
        // 2. 插入新的关联
        if (course.getHighlights() != null && !course.getHighlights().isEmpty()) {
            for (Highlight highlight : course.getHighlights()) {
                courseMapper.insertCourseHighlight(courseId, highlight.getId());
            }
        }
    }
    /**
     * 参数校验
     */
    private void validateCourseDTO(CourseDTO dto) {
        if (dto.getCourseName() == null || dto.getCourseName().trim().isEmpty()) {
            throw new SpringException("课程名称不能为空", 400);
        }
        if (dto.getCourseName().length() > 20) {
            throw new SpringException("课程名称长度不能超过20个字符", 400);
        }
        if (dto.getCategory() == null || dto.getCategory().trim().isEmpty()) {
            throw new SpringException("课程分类不能为空", 400);
        }
        if (dto.getDescription() == null || dto.getDescription().trim().isEmpty()) {
            throw new SpringException("课程描述不能为空", 400);
        }
        if (dto.getDescription().length() > 100) {
            throw new SpringException("课程描述长度不能超过100个字符", 400);
        }
        if (dto.getOnline() == null) {
            throw new SpringException("是否线上课程不能为空", 400);
        }
    }
}
```

------

**HighlightService.java**

```java
package com.example.mybatis.service;
import com.baomidou.mybatisplus.extension.service.IService;
import com.example.mybatis.common.HttpResult;
import com.example.mybatis.dto.HighlightDTO;
import com.example.mybatis.entity.Highlight;
import java.util.List;
/**
 * 亮点服务接口
 * @author yihui
 */
public interface HighlightService extends IService<Highlight> {
    /**
     * 查询所有亮点（返回 DTO）
     */
    List<HighlightDTO> listAllHighlights();
    /**
     * 新增亮点
     */
    HttpResult<String> addHighlight(HighlightDTO dto);
    /**
     * 更新亮点
     */
    HttpResult<String> updateHighlight(HighlightDTO dto);
    /**
     * 删除亮点
     */
    HttpResult<String> deleteHighlight(Long highlightId);
}
```

**HighlightServiceImpl.java**

```java
package com.example.mybatis.service.impl;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.example.mybatis.common.HttpResult;
import com.example.mybatis.common.SpringException;
import com.example.mybatis.dto.HighlightDTO;
import com.example.mybatis.entity.Highlight;
import com.example.mybatis.mapper.HighlightMapper;
import com.example.mybatis.service.HighlightService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.stream.Collectors;
/**
 * 亮点服务实现类
 * @author yihui
 */
@Service
@RequiredArgsConstructor
public class HighlightServiceImpl extends ServiceImpl<HighlightMapper, Highlight>
        implements HighlightService {
    private final HighlightMapper highlightMapper;
    @Override
    public List<HighlightDTO> listAllHighlights() {
        try {
            List<Highlight> highlights = this.list();
            return highlights.stream().map(highlight -> {
                HighlightDTO dto = new HighlightDTO();
                BeanUtils.copyProperties(highlight, dto);
                return dto;
            }).collect(Collectors.toList());
        } catch (Exception e) {
            throw new SpringException("查询亮点列表失败: " + e.getMessage(), 500, e);
        }
    }
    @Override
    @Transactional(rollbackFor = Exception.class)
    public HttpResult<String> addHighlight(HighlightDTO dto) {
        // 1. 参数校验
        validateHighlightDTO(dto);
        
        // 2. 检查名称是否重复
        boolean exists = this.lambdaQuery()
                .eq(Highlight::getName, dto.getName().trim())
                .exists();
        if (exists) {
            return HttpResult.error(400, "亮点名称已存在");
        }
        
        // 3. 保存亮点
        Highlight highlight = convertToEntity(dto);
        boolean success = this.save(highlight);
        
        if (!success) {
            return HttpResult.error(500, "新增亮点失败");
        }
        
        return HttpResult.ok("新增成功");
    }
    @Override
    @Transactional(rollbackFor = Exception.class)
    public HttpResult<String> updateHighlight(HighlightDTO dto) {
        // 1. 参数校验
        if (dto.getId() == null) {
            return HttpResult.error(400, "亮点ID不能为空");
        }
        
        validateHighlightDTO(dto);
        
        // 2. 检查亮点是否存在
        Highlight existingHighlight = this.getById(dto.getId());
        if (existingHighlight == null) {
            return HttpResult.error(404, "亮点不存在");
        }
        
        // 3. 检查名称是否重复（排除自己）
        boolean exists = this.lambdaQuery()
                .eq(Highlight::getName, dto.getName().trim())
                .ne(Highlight::getId, dto.getId())
                .exists();
        if (exists) {
            return HttpResult.error(400, "亮点名称已存在");
        }
        
        // 4. 更新亮点
        Highlight highlight = convertToEntity(dto);
        boolean success = this.updateById(highlight);
        
        if (!success) {
            return HttpResult.error(500, "更新亮点失败");
        }
        
        return HttpResult.ok("更新成功");
    }
    @Override
    @Transactional(rollbackFor = Exception.class)
    public HttpResult<String> deleteHighlight(Long highlightId) {
        // 1. 参数校验
        if (highlightId == null) {
            return HttpResult.error(400, "亮点ID不能为空");
        }
        
        // 2. 检查亮点是否存在
        Highlight existingHighlight = this.getById(highlightId);
        if (existingHighlight == null) {
            return HttpResult.error(404, "亮点不存在");
        }
        
        // 3. 检查是否被课程引用
        int referenceCount = highlightMapper.countCoursesByHighlightId(highlightId);
        if (referenceCount > 0) {
            return HttpResult.error(400, "该亮点已被 " + referenceCount + " 个课程引用，无法删除");
        }
        
        // 4. 删除亮点
        boolean success = this.removeById(highlightId);
        if (!success) {
            return HttpResult.error(500, "删除亮点失败");
        }
        
        return HttpResult.ok("删除成功");
    }
    // ========== 辅助方法 ==========
    private Highlight convertToEntity(HighlightDTO dto) {
        Highlight highlight = new Highlight();
        BeanUtils.copyProperties(dto, highlight);
        return highlight;
    }
    private void validateHighlightDTO(HighlightDTO dto) {
        if (dto.getName() == null || dto.getName().trim().isEmpty()) {
            throw new SpringException("亮点名称不能为空", 400);
        }
        if (dto.getName().length() > 20) {
            throw new SpringException("亮点名称长度不能超过20个字符", 400);
        }
    }
}
```

------

### 3.6 Controller 层

**CourseController.java**

```java
package com.example.mybatis.controller;
import com.example.mybatis.common.HttpResult;
import com.example.mybatis.dto.CourseDTO;
import com.example.mybatis.service.CourseService;
import com.github.pagehelper.PageInfo;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
/**
 * 课程管理控制器
 * @author yihui
 */
@RestController
@RequestMapping("/course")
@RequiredArgsConstructor
@Tag(name = "课程管理", description = "课程的增删改查与分页接口")
public class CourseController {
    private final CourseService courseService;
    /**
     * 分页查询课程
     */
    @GetMapping("/page")
    @Operation(summary = "分页查询课程")
    public HttpResult<PageInfo<CourseDTO>> page(
            @RequestParam(defaultValue = "1") Integer page,
            @RequestParam(defaultValue = "5") Integer pageSize,
            @RequestParam(required = false) String keyword) {
        return HttpResult.ok(courseService.pageCoursesWithDTO(page, pageSize, keyword));
    }
    /**
     * 新增课程
     */
    @PostMapping("/add")
    @Operation(summary = "新增课程")
    public HttpResult<String> add(@Valid @RequestBody CourseDTO dto) {
        return courseService.addCourse(dto);
    }
    /**
     * 更新课程
     */
    @PutMapping("/update")
    @Operation(summary = "更新课程")
    public HttpResult<String> update(@Valid @RequestBody CourseDTO dto) {
        return courseService.updateCourse(dto);
    }
    /**
     * 删除课程
     */
    @PostMapping("/delete")
    @Operation(summary = "删除课程")
    public HttpResult<String> delete(@RequestBody CourseDTO dto) {
        return courseService.deleteCourse(dto.getId());
    }
}
```

**HighlightController.java**

```java
package com.example.mybatis.controller;
import com.example.mybatis.common.HttpResult;
import com.example.mybatis.dto.HighlightDTO;
import com.example.mybatis.service.HighlightService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.List;
/**
 * 亮点管理控制器
 * @author yihui
 */
@RestController
@RequestMapping("/highlight")
@RequiredArgsConstructor
@Tag(name = "亮点管理", description = "亮点的增删改查接口")
public class HighlightController {
    private final HighlightService highlightService;
    @GetMapping("/list")
    @Operation(summary = "查询所有亮点")
    public HttpResult<List<HighlightDTO>> list() {
        return HttpResult.ok(highlightService.listAllHighlights());
    }
    @PostMapping("/add")
    @Operation(summary = "新增亮点")
    public HttpResult<String> add(@Valid @RequestBody HighlightDTO dto) {
        return highlightService.addHighlight(dto);
    }
    @PutMapping("/update")
    @Operation(summary = "更新亮点")
    public HttpResult<String> update(@Valid @RequestBody HighlightDTO dto) {
        return highlightService.updateHighlight(dto);
    }
    @PostMapping("/delete")
    @Operation(summary = "删除亮点")
    public HttpResult<String> delete(@RequestBody HighlightDTO dto) {
        return highlightService.deleteHighlight(dto.getId());
    }
}
```

------

## 4. 前端实现（Vue3 + TypeScript）

### 4.1 类型定义

**useCourse.ts（类型部分）**

```ts
// ==================== 类型定义 ====================
/** 亮点项 */
export interface HighlightItem {
  id: number;
  name: string;
}
/** 课程表单 */
export interface CourseForm {
  id: number | null;
  courseName: string;
  category: string;
  description: string;
  online: boolean;
  highlightIds: number[];
}
// ==================== 常量 ====================
/** 默认表单值 */
const DEFAULT_FORM: CourseForm = {
  id: null,
  courseName: '',
  category: '',
  description: '',
  online: false,
  highlightIds: [],
};
/** 课程分类选项 */
const CATEGORY_OPTIONS = ['编程语言', '数据科学', '数据库', '后端开发', '前端开发'];
```

------

### 4.2 核心逻辑（useCourse.ts）

```ts
import { ref, computed, onMounted, nextTick } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { requestClient } from '#/api/request';
export function useCourse() {
  // ==================== 课程列表状态 ====================
  const loading = ref(false);
  const courseList = ref<any[]>([]);
  const total = ref(0);
  const page = ref(1);
  const pageSize = ref(5);
  const keyword = ref('');
  // ==================== 课程表单状态 ====================
  const formVisible = ref(false);
  const formRef = ref();
  const form = ref<CourseForm>({ ...DEFAULT_FORM });
  // ==================== 亮点相关状态 ====================
  const highlightOptions = ref<HighlightItem[]>([]);
  const highlightManageVisible = ref(false);
  const highlightEditVisible = ref(false);
  const editingHighlight = ref<HighlightItem>({ id: 0, name: '' });
  const newHighlightName = ref('');
  // ==================== 计算属性 ====================
  const categoryOptions = computed(() => CATEGORY_OPTIONS);
  /** 亮点 ID -> 名称 映射 */
  const highlightMap = computed(() => {
    const map: Record<number, string> = {};
    highlightOptions.value.forEach((h) => {
      map[h.id] = h.name;
    });
    return map;
  });
  // ==================== 亮点相关方法 ====================
  /** 获取亮点列表 */
  const fetchHighlightOptions = async () => {
    try {
      const res = await requestClient.get('/highlight/list');
      const outer = (res as any).data ?? res;
      highlightOptions.value = outer.data || outer || [];
    } catch (e) {
      console.error('获取亮点列表失败:', e);
    }
  };
  /** 打开亮点管理弹窗 */
  const openHighlightManager = () => {
    highlightManageVisible.value = true;
    newHighlightName.value = '';
  };
  /** 打开编辑亮点弹窗 */
  const openEditHighlight = (item: HighlightItem) => {
    editingHighlight.value = { ...item };
    highlightEditVisible.value = true;
  };
  /** 保存新亮点 */
  const saveNewHighlight = async () => {
    if (!newHighlightName.value.trim()) {
      ElMessage.warning('请输入亮点名称');
      return;
    }
    try {
      await requestClient.post('/highlight/add', {
        name: newHighlightName.value.trim(),
      });
      ElMessage.success('亮点添加成功');
      newHighlightName.value = '';
      await fetchHighlightOptions();
    } catch (error) {
      console.error('新增亮点失败:', error);
    }
  };
  /** 保存编辑的亮点 */
  const saveEditedHighlight = async () => {
    try {
      await requestClient.put('/highlight/update', editingHighlight.value);
      ElMessage.success('更新成功');
      highlightEditVisible.value = false;
      await fetchHighlightOptions();
    } catch (error) {
      console.error('更新亮点失败:', error);
    }
  };
  /** 删除亮点 */
  const deleteHighlight = async (id: number) => {
    try {
      await ElMessageBox.confirm('确定删除该亮点吗？该操作不可恢复！', '提示', {
        type: 'warning',
        confirmButtonText: '确定',
        cancelButtonText: '取消',
      });
      await requestClient.post('/highlight/delete', { id });
      ElMessage.success('删除成功');
      await fetchHighlightOptions();
    } catch (error: any) {
      if (!(error instanceof Error && error.message.includes('cancel'))) {
        console.error('删除亮点失败:', error);
      }
    }
  };
  // ==================== 课程相关方法 ====================
  /** 获取课程列表 */
  const fetchCourses = async () => {
    loading.value = true;
    try {
      const res = await requestClient.get('/course/page', {
        params: { 
          page: page.value, 
          pageSize: pageSize.value, 
          keyword: keyword.value 
        },
      });
      const data = (res as any).data || res;
      const pageData = data.data || data;
      courseList.value = pageData.list || pageData.records || [];
      total.value = Number(pageData.total) || 0;
    } catch (error) {
      console.error('获取课程列表失败:', error);
      ElMessage.error('获取课程列表失败');
    } finally {
      loading.value = false;
    }
  };
  /** 打开新增课程弹窗 */
  const openAddDialog = () => {
    form.value = { ...DEFAULT_FORM };
    formVisible.value = true;
    nextTick(() => formRef.value?.clearValidate?.());
  };
  /** 打开编辑课程弹窗 */
  const openEditDialog = (row: any) => {
    form.value = {
      ...row,
      highlightIds: row.highlightIds || [],
    };
    formVisible.value = true;
    nextTick(() => formRef.value?.clearValidate?.());
  };
  /** 保存课程 */
  const saveCourse = async () => {
    // 参数校验
    if (!form.value.courseName?.trim() || !form.value.category || !form.value.description?.trim()) {
      ElMessage.warning('请填写所有必填项');
      return;
    }
    const payload = {
      ...form.value,
      highlightIds: form.value.highlightIds || [],
    };
    try {
      if (form.value.id) {
        // 更新
        await requestClient.put('/course/update', payload);
        ElMessage.success('课程更新成功');
      } else {
        // 新增
        await requestClient.post('/course/add', payload);
        ElMessage.success('课程新增成功');
      }
      formVisible.value = false;
      await fetchCourses();
    } catch (error) {
      console.error('保存课程失败:', error);
    }
  };
  /** 删除课程 */
  const deleteCourse = async (row: any) => {
    try {
      await ElMessageBox.confirm(`确定删除【${row.courseName}】吗？该操作不可恢复！`, '提示', {
        type: 'warning',
        confirmButtonText: '确定',
        cancelButtonText: '取消',
      });
      
      await requestClient.post('/course/delete', { id: row.id });
      ElMessage.success('课程已删除');
      await fetchCourses();
    } catch (error: any) {
      if (!(error instanceof Error && error.message.includes('cancel'))) {
        console.error('删除课程失败:', error);
      }
    }
  };
  // ==================== 生命周期 ====================
  onMounted(() => {
    fetchCourses();
    fetchHighlightOptions();
  });
  return {
    // 课程列表状态
    loading,
    courseList,
    total,
    page,
    pageSize,
    keyword,
    categoryOptions,
    // 课程表单状态
    formVisible,
    formRef,
    form,
    // 亮点状态
    highlightOptions,
    highlightMap,
    highlightManageVisible,
    highlightEditVisible,
    editingHighlight,
    newHighlightName,
    // 课程方法
    fetchCourses,
    openAddDialog,
    openEditDialog,
    saveCourse,
    deleteCourse,
    // 亮点方法
    openHighlightManager,
    openEditHighlight,
    saveNewHighlight,
    saveEditedHighlight,
    deleteHighlight,
  };
}
```

### 4.3 课程列表主页面（index.vue）

```vue
<script setup lang="ts">
import { useAccess } from '@vben/access';
import CourseForm from './CourseForm.vue';
import HighlightManager from './HighlightManager.vue';
import { useCourse } from './useCourse';
const { hasAccessByCodes } = useAccess();
const {
  // 课程列表状态
  loading,
  courseList,
  total,
  page,
  pageSize,
  keyword,
  categoryOptions,
  // 课程表单状态
  formVisible,
  formRef,
  form,
  // 亮点状态
  highlightOptions,
  highlightMap,
  highlightManageVisible,
  highlightEditVisible,
  editingHighlight,
  newHighlightName,
  // 课程方法
  fetchCourses,
  openAddDialog,
  openEditDialog,
  saveCourse,
  deleteCourse,
  // 亮点方法
  openHighlightManager,
  openEditHighlight,
  saveNewHighlight,
  saveEditedHighlight,
  deleteHighlight,
} = useCourse();
</script>
<template>
  <div class="p-4">
    <!-- 搜索与操作 -->
    <div class="flex items-center justify-between mb-4">
      <el-input
        v-model="keyword"
        placeholder="请输入课程名称或描述"
        clearable
        class="w-1/3"
        @clear="fetchCourses"
        @keyup.enter="fetchCourses"
      />
      <el-button
        v-if="hasAccessByCodes(['course:add'])"
        type="primary"
        @click="openAddDialog"
      >
        新增课程
      </el-button>
    </div>
    <!-- 课程列表 -->
    <el-table :data="courseList" v-loading="loading" border style="width: 100%">
      <el-table-column prop="courseName" label="课程名称" />
      <el-table-column prop="category" label="分类" />
      <el-table-column prop="description" label="描述" show-overflow-tooltip />
      <el-table-column
        prop="online"
        label="是否线上课程"
        width="120"
        :formatter="(r: any) => (r.online ? '是' : '否')"
      />
      <el-table-column label="亮点">
        <template #default="{ row }">
          <el-tag
            v-for="id in row.highlightIds"
            :key="id"
            type="success"
            class="mr-1"
          >
            {{ highlightMap[id] }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180">
        <template #default="{ row }">
          <el-button
            v-if="hasAccessByCodes(['course:edit'])"
            size="small"
            @click="openEditDialog(row)"
          >
            编辑
          </el-button>
          <el-button
            v-if="hasAccessByCodes(['course:delete'])"
            type="danger"
            size="small"
            @click="deleteCourse(row)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    <!-- 分页 -->
    <div class="mt-4 flex justify-end">
      <el-pagination
        background
        layout="prev, pager, next"
        :total="total"
        :page-size="pageSize"
        :current-page="page"
        @current-change="(p: number) => { page = p; fetchCourses(); }"
      />
    </div>
    <!-- 课程表单弹窗 -->
    <CourseForm
      v-if="formVisible"
      :visible="formVisible"
      :form="form"
      :form-ref="formRef"
      :category-options="categoryOptions"
      :highlight-options="highlightOptions"
      @update:visible="formVisible = $event"
      @save="saveCourse"
      @manage-highlights="openHighlightManager"
    />
    <!-- 亮点管理弹窗 -->
    <HighlightManager
      :visible="highlightManageVisible"
      :highlight-options="highlightOptions"
      :new-highlight-name="newHighlightName"
      :edit-visible="highlightEditVisible"
      :editing-highlight="editingHighlight"
      @update:visible="highlightManageVisible = $event"
      @update:newHighlightName="newHighlightName = $event"
      @update:editVisible="highlightEditVisible = $event"
      @add="saveNewHighlight"
      @edit="openEditHighlight"
      @save-edit="saveEditedHighlight"
      @delete="deleteHighlight"
    />
  </div>
</template>
<style scoped>
/* 如果需要额外样式可以在这里添加 */
</style>

```

### 4.4 课程表单弹窗组件（CourseForm.vue）

```vue
<script setup lang="ts">
import { computed } from 'vue';
import type { CourseForm, HighlightItem } from './useCourse';
interface Props {
  visible: boolean;
  form: CourseForm;
  formRef: any;
  categoryOptions: string[];
  highlightOptions: HighlightItem[];
}
const props = defineProps<Props>();
const emit = defineEmits<{
  'update:visible': [value: boolean];
  'save': [];
  'manage-highlights': [];
}>();
const localVisible = computed({
  get: () => props.visible,
  set: (val: boolean) => emit('update:visible', val),
});
</script>
<template>
  <el-dialog
    v-model="localVisible"
    :title="form.id ? '编辑课程' : '新增课程'"
    width="720px"
    class="course-dialog"
    align-center
  >
    <el-form
      :ref="formRef"
      :model="form"
      label-position="top"
      class="course-form"
    >
      <!-- 第一行：课程名称 + 分类 -->
      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item label="课程名称" required>
            <el-input v-model="form.courseName" maxlength="20" show-word-limit />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="课程分类" required>
            <el-select v-model="form.category" placeholder="请选择" style="width: 100%">
              <el-option
                v-for="c in categoryOptions"
                :key="c"
                :label="c"
                :value="c"
              />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>
      <!-- 第二行：是否线上课程 -->
      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item label="是否线上课程" required>
            <el-switch v-model="form.online" />
          </el-form-item>
        </el-col>
      </el-row>
      <!-- 描述 -->
      <el-form-item label="课程描述" required>
        <el-input
          type="textarea"
          v-model="form.description"
          :rows="3"
          maxlength="100"
          show-word-limit
        />
      </el-form-item>
      <!-- 课程亮点 + 管理入口 -->
      <el-form-item label="课程亮点">
        <div class="flex items-center w-full gap-3">
          <el-select
            v-model="form.highlightIds"
            multiple
            placeholder="请选择亮点"
            class="flex-1"
          >
            <el-option
              v-for="item in highlightOptions"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            />
          </el-select>
          <el-button type="primary" text @click="emit('manage-highlights')">
            管理亮点
          </el-button>
        </div>
        <div class="form-tip">
          可以在「管理亮点」中新增 / 编辑 / 删除亮点。
        </div>
      </el-form-item>
    </el-form>
    <template #footer>
      <div class="dialog-footer">
        <el-button @click="localVisible = false">取消</el-button>
        <el-button type="primary" @click="emit('save')">保存</el-button>
      </div>
    </template>
  </el-dialog>
</template>
<style scoped>
.course-dialog :deep(.el-dialog__body) {
  padding: 18px 24px 8px;
}
.course-form {
  margin-top: 4px;
}
.course-form .el-form-item {
  margin-bottom: 14px;
}
.form-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>

```

### 4.5 亮点管理弹窗组件（HighlightManager.vue）

```vue
<script setup lang="ts">
import { computed } from 'vue';
import type { HighlightItem } from './useCourse';
interface Props {
  visible: boolean;
  highlightOptions: HighlightItem[];
  newHighlightName: string;
  editVisible: boolean;
  editingHighlight: HighlightItem;
}
const props = defineProps<Props>();
const emit = defineEmits<{
  'update:visible': [value: boolean];
  'update:newHighlightName': [value: string];
  'update:editVisible': [value: boolean];
  'add': [];
  'edit': [item: HighlightItem];
  'save-edit': [];
  'delete': [id: number];
}>();
const localVisible = computed({
  get: () => props.visible,
  set: (val: boolean) => emit('update:visible', val),
});
const localNewName = computed({
  get: () => props.newHighlightName,
  set: (val: string) => emit('update:newHighlightName', val),
});
const localEditVisible = computed({
  get: () => props.editVisible,
  set: (val: boolean) => emit('update:editVisible', val),
});
</script>
<template>
  <div>
    <!-- 亮点管理主弹窗 -->
    <el-dialog
      v-model="localVisible"
      title="管理课程亮点"
      width="640px"
      class="highlight-dialog"
      align-center
    >
      <div class="highlight-header">
        <div class="title">亮点维护</div>
        <div class="desc">在这里可以新增、编辑或删除课程亮点。</div>
      </div>
      <!-- 新增亮点 -->
      <div class="highlight-add">
        <el-input
          v-model="localNewName"
          placeholder="请输入新的亮点名称（最多20个字符）"
          maxlength="20"
          show-word-limit
          clearable
          @keyup.enter="emit('add')"
        />
        <el-button type="primary" @click="emit('add')">新增</el-button>
      </div>
      <!-- 亮点列表 -->
      <el-table
        :data="highlightOptions"
        border
        size="small"
        style="width: 100%; margin-top: 12px"
        max-height="400"
      >
        <el-table-column label="亮点名称" prop="name" />
        <el-table-column label="操作" width="160" align="center">
          <template #default="{ row }">
            <el-button type="primary" link @click="emit('edit', row)">
              编辑
            </el-button>
            <el-button type="danger" link @click="emit('delete', row.id)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="localVisible = false">关闭</el-button>
      </template>
    </el-dialog>
    <!-- 编辑亮点弹窗 -->
    <el-dialog
      v-model="localEditVisible"
      title="编辑亮点"
      width="400px"
      align-center
    >
      <el-input
        v-model="editingHighlight.name"
        placeholder="请输入亮点名称（最多20个字符）"
        maxlength="20"
        show-word-limit
      />
      <template #footer>
        <el-button @click="localEditVisible = false">取消</el-button>
        <el-button type="primary" @click="emit('save-edit')">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
<style scoped>
.highlight-dialog :deep(.el-dialog__body) {
  padding: 18px 24px 10px;
}
.highlight-header .title {
  font-size: 15px;
  font-weight: 600;
}
.highlight-header .desc {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}
.highlight-add {
  margin-top: 12px;
  display: flex;
  gap: 10px;
  align-items: center;
}
</style>

```

------

## 5. 测试接口

### 5.1 获取课程列表

**请求**：

```
GET http://localhost:8080/course/page?page=1&pageSize=5&keyword=Java
```

**响应**：

```json
{
  "code": 200,
  "message": "操作成功",
  "data": {
    "pageNum": 1,
    "pageSize": 5,
    "total": 3,
    "pages": 1,
    "list": [
      {
        "id": "1001",
        "courseName": "Java 基础入门",
        "category": "编程语言",
        "description": "从零开始学习 Java 编程",
        "online": true,
        "highlightIds": [1, 2, 3]
      },
      {
        "id": "1002",
        "courseName": "Java 高级进阶",
        "category": "编程语言",
        "description": "深入学习 Java 高级特性",
        "online": true,
        "highlightIds": [1, 4]
      }
    ]
  }
}
```

------

### 5.2 新增课程

**请求**：

```json
POST http://localhost:8080/course/add
Content-Type: application/json
{
  "courseName": "Spring Boot 实战",
  "category": "后端开发",
  "description": "从零开始学习 Spring Boot 微服务开发",
  "online": true,
  "highlightIds": [1, 2, 5]
}
```

**响应（成功）**：

```json
{
  "code": 200,
  "message": "操作成功",
  "data": "新增成功"
}
```

**响应（参数错误）**：

```json
{
  "code": 400,
  "message": "课程名称不能为空",
  "data": null
}
```

------

### 5.3 更新课程

**请求**：

```json
PUT http://localhost:8080/course/update
Content-Type: application/json
{
  "id": 1001,
  "courseName": "Java 基础入门（更新版）",
  "category": "编程语言",
  "description": "从零开始学习 Java 编程，包含最新特性",
  "online": true,
  "highlightIds": [1, 2, 3, 4]
}
```

**响应**：

```json
{
  "code": 200,
  "message": "操作成功",
  "data": "更新成功"
}
```

------

### 5.4 删除课程

**请求**：

```json
POST http://localhost:8080/course/delete
Content-Type: application/json
{
  "id": 1001
}
```

**响应**：

```json
{
  "code": 200,
  "message": "操作成功",
  "data": "删除成功"
}
```

------

### 5.5 获取亮点列表

**请求**：

```json
GET http://localhost:8080/highlight/list
```

**响应**：

```json
{
  "code": 200,
  "message": "操作成功",
  "data": [
    { "id": 1, "name": "实战项目" },
    { "id": 2, "name": "名师授课" },
    { "id": 3, "name": "高薪就业" },
    { "id": 4, "name": "终身复习" },
    { "id": 5, "name": "小班教学" }
  ]
}
```

------

### 5.6 新增亮点

**请求**：

```json
POST http://localhost:8080/highlight/add
Content-Type: application/json
{
  "name": "直播授课"
}
```

**响应（成功）**：

```json
{
  "code": 200,
  "message": "操作成功",
  "data": "新增成功"
}
```

**响应（名称重复）**：

```json
{
  "code": 400,
  "message": "亮点名称已存在",
  "data": null
}
```

------

### 5.7 删除亮点

**请求**：

```json
POST http://localhost:8080/highlight/delete
Content-Type: application/json
{
  "id": 6
}
```

**响应（成功）**：

```json
{
  "code": 200,
  "message": "操作成功",
  "data": "删除成功"
}
```

**响应（被引用）**：

```json
{
  "code": 400,
  "message": "该亮点已被 3 个课程引用，无法删除",
  "data": null
}
```

------

## 6. 核心功能说明

### 6.1 多对多关系处理

**数据库层面**：

```mysql
-- 一个课程有多个亮点
SELECT h.id, h.name 
FROM highlight h
JOIN course_highlight ch ON h.id = ch.highlight_id
WHERE ch.course_id = 1001;
-- 一个亮点被多个课程使用
SELECT c.id, c.course_name 
FROM course c
JOIN course_highlight ch ON c.id = ch.course_id
WHERE ch.highlight_id = 1;
```

**后端处理**：

```java
// 保存/更新课程时处理亮点关联
private void saveOrUpdateHighlights(Course course) {
    // 1. 删除旧关联
    courseMapper.deleteHighlightsByCourseId(course.getId());
    
    // 2. 插入新关联
    if (course.getHighlights() != null) {
        for (Highlight highlight : course.getHighlights()) {
            courseMapper.insertCourseHighlight(course.getId(), highlight.getId());
        }
    }
}
```

**前端处理**：

```ts
// 表单提交时只传亮点 ID 数组
const payload = {
  courseName: "Java 基础",
  category: "编程语言",
  highlightIds: [1, 2, 3]  // 只传 ID
};
```

------

### 6.2 级联删除处理

**场景 1：删除课程**

```java
@Override
@Transactional(rollbackFor = Exception.class)
public HttpResult<String> deleteCourse(Long courseId) {
    // 删除课程时，外键级联自动删除 course_highlight 中的关联数据
    boolean success = this.removeById(courseId);
    return HttpResult.ok("删除成功");
}
```

**场景 2：删除亮点（需要检查）**

```java
@Override
@Transactional(rollbackFor = Exception.class)
public HttpResult<String> deleteHighlight(Long highlightId) {
    // 检查是否被课程引用
    int referenceCount = highlightMapper.countCoursesByHighlightId(highlightId);
    if (referenceCount > 0) {
        return HttpResult.error(400, "该亮点已被 " + referenceCount + " 个课程引用，无法删除");
    }
    
    boolean success = this.removeById(highlightId);
    return HttpResult.ok("删除成功");
}
```



------

## 7. 总结

**架构总结**：

```
前端（Vue3）
    ↓ HTTP 请求
Controller 层（接收请求）
    ↓ 调用 Service
Service 层（业务逻辑）
    ↓ 调用 Mapper
Mapper 层（数据访问）
    ↓ 执行 SQL
数据库（MySQL）

特殊处理：
- 分页查询：使用 PageHelper 拦截 SQL
- 多对多关联：通过中间表实现
- 性能优化：批量查询避免 N+1
- 事务管理：@Transactional 保证数据一致性
```

------

**最佳实践总结**：

1. **使用 DTO 隔离前后端**：避免直接传递 Entity
2. **参数校验统一处理**：使用 @Valid 和 @NotBlank 等注解
3. **异常统一处理**：使用 GlobalExceptionHandler 捕获异常
4. **批量查询优化**：避免 N+1 查询问题
5. **事务管理**：关键操作加 @Transactional
6. **日志记录**：关键操作记录日志，便于排查问题
7. **前端状态管理**：使用 Composition API 抽取逻辑
8. **权限控制**：使用 `v-if="hasAccessByCodes(['course:add'])"` 控制按钮显示