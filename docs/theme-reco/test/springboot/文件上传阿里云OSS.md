---
title: 文件上传阿里云OSS
date: 2025-11-28
tags:
 - OSS
 - aliyun
 - Springboot
categories:
 - 项目实战
 - 练习
---

# 文件上传（OSS）完整配置文档

## 1. 前言

在现代 Web 应用中，文件上传是常见需求（如用户头像、新闻配图、文档附件等）。

传统的**本地存储**方案存在以下问题：

- 占用服务器磁盘空间
- 分布式部署时文件同步困难
- 无法利用 CDN 加速
- 缺乏专业的备份和容灾机制

**阿里云 OSS（Object Storage Service）** 是一种海量、安全、低成本、高可靠的云存储服务，具有以下优势：

- **海量存储**：不限容量，按需付费

- **高可用**：99.995% 的数据可靠性
- **全球加速**：支持 CDN 加速访问
- **安全可控**：支持访问权限控制、防盗链



## 2. 核心依赖

确保 `pom.xml` 中包含以下依赖：

```xml
<!-- 阿里云 OSS SDK -->
<dependency>
    <groupId>com.aliyun.oss</groupId>
    <artifactId>aliyun-sdk-oss</artifactId>
    <version>3.17.1</version>
</dependency>
<!-- Spring Boot Web -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
</dependency>
<!-- Lombok -->
<dependency>
    <groupId>org.projectlombok</groupId>
    <artifactId>lombok</artifactId>
</dependency>
```



------

## 3. 阿里云 OSS 配置

### 3.1 在阿里云控制台创建 Bucket

1. 登录 [阿里云 OSS 控制台](https://oss.console.aliyun.com/)
2. 点击"创建 Bucket"
3. 配置参数：
   - **Bucket 名称**：全局唯一（如 `my-project-files`）
   - **地域**：选择离用户最近的区域（如华北2-北京）
   - **存储类型**：标准存储
   - **读写权限**：公共读（允许匿名访问文件）
   - **服务端加密**：无
4. 创建完成后记录：
   - **Endpoint**：`oss-cn-beijing.aliyuncs.com`
   - **Bucket Name**：`my-project-files`

### 3.2 创建 AccessKey

1. 进入 [RAM 访问控制](https://ram.console.aliyun.com/)
2. 创建用户 → 勾选"OpenAPI 调用访问"
3. 授权策略：`AliyunOSSFullAccess`（OSS 完全权限）
4. 保存 **AccessKey ID** 和 **AccessKey Secret**（只显示一次，务必保存）

------

## 4. 配置文件

**文件位置**：`src/main/resources/application.yml`



```yml
aliyun:
  oss:
    # OSS 服务端点（根据 Bucket 所在地域选择）
    endpoint: oss-cn-beijing.aliyuncs.com
    
    # AccessKey ID（从环境变量读取，避免泄露）
    access-key-id: ${ALIYUN_OSS_ACCESS_KEY_ID:default-key}
    
    # AccessKey Secret（从环境变量读取，避免泄露）
    access-key-secret: ${ALIYUN_OSS_ACCESS_KEY_SECRET:default-secret}
    
    # Bucket 名称
    bucket-name: ${ALIYUN_OSS_BUCKET_NAME:my-project-files}
    
    # CDN 域名（可选，用于加速访问）
    cdn-domain: ${ALIYUN_OSS_CDN_DOMAIN:}
```

**环境变量配置**（生产环境）：



```cmd
# Linux/Mac
export ALIYUN_OSS_ACCESS_KEY_ID=LTAI5tXXXXXXXXXXXXXX
export ALIYUN_OSS_ACCESS_KEY_SECRET=xxxxxxxxxxxxxxxxxxx
export ALIYUN_OSS_BUCKET_NAME=my-project-files
# Windows
set ALIYUN_OSS_ACCESS_KEY_ID=LTAI5tXXXXXXXXXXXXXX
set ALIYUN_OSS_ACCESS_KEY_SECRET=xxxxxxxxxxxxxxxxxxx
set ALIYUN_OSS_BUCKET_NAME=my-project-files
```

------

## 5. 创建 OSS 配置类

**文件位置**：`src/main/java/com/example/mybatis/config/OssConfig.java`



```java
package com.example.mybatis.config;
import com.aliyun.oss.OSS;
import com.aliyun.oss.OSSClientBuilder;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
/**
 * 阿里云 OSS 配置类
 * 从 application.yml 中读取配置并创建 OSS 客户端
 * 
 * @author yihui
 */
@Data
@Configuration
@ConfigurationProperties(prefix = "aliyun.oss")
public class OssConfig {
    /** OSS 服务端点 */
    private String endpoint;
    /** AccessKey ID */
    private String accessKeyId;
    /** AccessKey Secret */
    private String accessKeySecret;
    /** Bucket 名称 */
    private String bucketName;
    /** CDN 域名（可选） */
    private String cdnDomain;
    /**
     * 创建 OSS 客户端 Bean
     * 
     * @return OSS 客户端实例
     */
    @Bean
    public OSS ossClient() {
        return new OSSClientBuilder().build(endpoint, accessKeyId, accessKeySecret);
    }
}
```

------

## 6. 创建 OSS 工具类

**文件位置**：`src/main/java/com/example/mybatis/utils/OssUtil.java`



```java
package com.example.mybatis.utils;

import com.aliyun.oss.OSS;
import com.aliyun.oss.model.ObjectMetadata;
import com.aliyun.oss.model.PutObjectRequest;
import com.example.mybatis.config.OssConfig;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.util.UUID;

/**
 * 阿里云 OSS 工具类
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class OssUtil {

    private final OSS ossClient;
    private final OssConfig ossConfig;

    /**
     * 上传文件到 OSS
     *
     * @param file 上传的文件
     * @param folder 文件夹路径（如：news/images）
     * @return 文件访问URL
     */
    public String uploadFile(MultipartFile file, String folder) {
        try {
            // 1. 生成唯一文件名
            // 格式：folder/yyyy-MM-dd/uuid.ext
            String originalFilename = file.getOriginalFilename();
            if (originalFilename == null || originalFilename.isEmpty()) {
                throw new RuntimeException("文件名不能为空");
            }

            String extension = originalFilename.substring(originalFilename.lastIndexOf("."));
//            String  = new SimpleDateFormat("yyyy-MM-dd").format(new Date());
            String fileName = folder + "/" + UUID.randomUUID() + extension;

            // 2. 设置文件元信息
            ObjectMetadata metadata = new ObjectMetadata();
            metadata.setContentLength(file.getSize());
            metadata.setContentType(file.getContentType());
            metadata.setCacheControl("no-cache");
            metadata.setHeader("Pragma", "no-cache");
            metadata.setContentDisposition("inline;filename=" + originalFilename);

            // 3. 上传文件到 OSS
            InputStream inputStream = file.getInputStream();
            PutObjectRequest request = new PutObjectRequest(
                    ossConfig.getBucketName(),
                    fileName,
                    inputStream,
                    metadata
            );

            ossClient.putObject(request);

            log.info("文件上传成功：{}", fileName);

            // 4. 返回文件访问URL
            return generateFileUrl(fileName);

        } catch (IOException e) {
            log.error("上传文件到OSS失败", e);
            throw new RuntimeException("文件上传失败: " + e.getMessage(), e);
        }
    }

    /**
     * 生成文件访问URL
     */
    private String generateFileUrl(String fileName) {
        // 如果配置了 CDN 域名，使用 CDN
        if (ossConfig.getCdnDomain() != null && !ossConfig.getCdnDomain().isEmpty()) {
            return ossConfig.getCdnDomain() + "/" + fileName;
        }

        // 否则使用 OSS 默认域名
        return "https://" + ossConfig.getBucketName() + "." +
                ossConfig.getEndpoint() + "/" + fileName;
    }

    /**
     * 删除 OSS 文件
     *
     * @param fileUrl 文件URL
     */
    public void deleteFile(String fileUrl) {
        try {
            // 从URL中提取文件key
            // 例如：https://bucket.oss-cn-hangzhou.aliyuncs.com/news/images/2024-01-15/abc.jpg
            // 提取：news/images/2024-01-15/abc.jpg
            String fileName;

            if (fileUrl.contains(".com/")) {
                fileName = fileUrl.substring(fileUrl.lastIndexOf(".com/") + 5);
            } else if (fileUrl.contains(ossConfig.getCdnDomain())) {
                fileName = fileUrl.substring(fileUrl.lastIndexOf(ossConfig.getCdnDomain()) + ossConfig.getCdnDomain().length() + 1);
            } else {
                log.warn("无法解析文件URL: {}", fileUrl);
                return;
            }

            ossClient.deleteObject(ossConfig.getBucketName(), fileName);
            log.info("删除OSS文件成功: {}", fileName);

        } catch (Exception e) {
            log.error("删除OSS文件失败: {}", fileUrl, e);
            throw new RuntimeException("删除文件失败: " + e.getMessage(), e);
        }
    }

    /**
     * 检查文件是否存在
     */
    public boolean doesFileExist(String fileName) {
        return ossClient.doesObjectExist(ossConfig.getBucketName(), fileName);
    }
}
```

------

## 7. 创建上传控制器

**文件位置**：`src/main/java/com/example/mybatis/controller/OssUploadController.java`



```java
package com.example.mybatis.controller;
import com.example.mybatis.common.HttpResult;
import com.example.mybatis.common.SpringException;
import com.example.mybatis.utils.OssUtil;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
/**
 * 文件上传控制器
 *
 * @author yihui
 */
@Slf4j
@RestController
@RequestMapping("/upload")
@Tag(name = "文件上传", description = "图片上传相关接口")
@RequiredArgsConstructor
public class OssUploadController {
    private final OssUtil ossUtil;
    // 允许的图片格式
    private static final List<String> ALLOWED_EXTENSIONS = Arrays.asList(
            "jpg", "jpeg", "png", "gif", "webp", "bmp"
    );
    // 最大文件大小：5MB
    private static final long MAX_FILE_SIZE = 5 * 1024 * 1024;
    /**
     * 上传新闻图片
     */
    @PostMapping("/news-image")
    @Operation(summary = "上传新闻图片")
    public HttpResult<Map<String, String>> uploadNewsImage(@RequestParam("file") MultipartFile file) {
        log.info("收到图片上传请求，文件名: {}, 大小: {} bytes",
                file.getOriginalFilename(), file.getSize());
        // 1. 校验文件是否为空
        validateFile(file);
        // 2. 校验文件大小
        validateFileSize(file);
        // 3. 校验文件类型
        String originalFilename = file.getOriginalFilename();
        validateFileName(originalFilename);
        validateFileExtension(originalFilename);
        // 4. 校验文件内容类型
        validateContentType(file);
        // 5. 上传到 OSS
        try {
            String imageUrl = ossUtil.uploadFile(file, "HBBTJ/news/images");
            log.info("图片上传成功: {}", imageUrl);
            Map<String, String> result = new HashMap<>();
            result.put("url", imageUrl);
            result.put("name", originalFilename);
            result.put("size", String.valueOf(file.getSize()));
            return HttpResult.ok(result);
        } catch (SpringException e) {
            throw e;
        } catch (Exception e) {
            log.error("上传图片失败", e);
            throw new SpringException("上传失败: " + e.getMessage(), 500);
        }
    }
    /**
     * 删除图片
     */
    @DeleteMapping("/delete")
    @Operation(summary = "删除图片")
    public HttpResult<String> deleteImage(@RequestParam String url) {
        log.info("收到删除图片请求: {}", url);
        validateUrl(url);
        try {
            ossUtil.deleteFile(url);
            log.info("图片删除成功: {}", url);
            return HttpResult.ok("删除成功");
        } catch (SpringException e) {
            throw e;
        } catch (Exception e) {
            log.error("删除图片失败: {}", url, e);
            throw new SpringException("删除失败: " + e.getMessage(), 500);
        }
    }
    // ==================== 私有校验方法 ====================
    /**
     * 校验文件是否为空
     */
    @SuppressWarnings("ConstantConditions")
    private void validateFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new SpringException("请选择要上传的文件", 400);
        }
    }
    /**
     * 校验文件大小
     */
    private void validateFileSize(MultipartFile file) {
        if (file.getSize() > MAX_FILE_SIZE) {
            throw new SpringException("文件大小不能超过5MB", 400);
        }
    }
    /**
     * 校验文件名
     */
    @SuppressWarnings("ConstantConditions")
    private void validateFileName(String filename) {
        if (filename == null || filename.isEmpty()) {
            throw new SpringException("文件名不能为空", 400);
        }
    }
    /**
     * 校验文件扩展名
     */
    private void validateFileExtension(String filename) {
        String extension = getFileExtension(filename);
        if (!ALLOWED_EXTENSIONS.contains(extension)) {
            throw new SpringException("只支持 JPG、PNG、GIF、WEBP、BMP 格式的图片", 400);
        }
    }
    /**
     * 校验文件内容类型
     */
    @SuppressWarnings("ConstantConditions")
    private void validateContentType(MultipartFile file) {
        String contentType = file.getContentType();
        if (contentType == null || !contentType.startsWith("image/")) {
            throw new SpringException("只能上传图片文件", 400);
        }
    }
    /**
     * 校验 URL
     */
    private void validateUrl(String url) {
        if (url == null || url.isEmpty()) {
            throw new SpringException("图片URL不能为空", 400);
        }
    }
    /**
     * 获取文件扩展名
     */
    private String getFileExtension(String filename) {
        if (filename == null || !filename.contains(".")) {
            return "";
        }
        return filename.substring(filename.lastIndexOf(".") + 1).toLowerCase();
    }
}
```

------

## 8. 测试接口

### 8.1 上传文件

**请求（Postman）**：



```json
POST http://localhost:8080/upload/news-image
Content-Type: multipart/form-data
file: [选择文件]
```

**响应（成功）**：



```json
{
  "code": 200,
  "message": "操作成功",
  "data": {
    "url": "https://my-project-files.oss-cn-beijing.aliyuncs.com/HBBTJ/news/images/2025-11-20/a1b2c3d4e5f6.jpg",
    "name": "example.jpg",
    "size": "245678"
  }
}
```

**响应（文件过大）**：



```json
{
  "code": 400,
  "message": "文件大小不能超过 5MB",
  "data": null
}
```

**响应（文件类型不支持）**：



```json
{
  "code": 400,
  "message": "不支持的文件类型，仅允许上传图片或文档",
  "data": null
}
```

------

### 8.2 删除文件

**请求**：



```
DELETE http://localhost:8080/upload/delete?url=https://my-project-files.oss-cn-beijing.aliyuncs.com/HBBTJ/news/images/2025-11-20/a1b2c3d4e5f6.jpg
```

**响应（成功）**：



```json
{
  "code": 200,
  "message": "操作成功",
  "data": "删除成功"
}
```

------

## 9. 前端调用示例（Vue3）



```java
<template>
  <Upload
    :action="uploadUrl"
    :headers="uploadHeaders"
    :before-upload="beforeUpload"
    @success="handleSuccess"
  >
    <Button icon="upload">上传图片</Button>
  </Upload>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { message } from 'ant-design-vue';
const uploadUrl = 'http://localhost:8080/upload/news-image';
const uploadHeaders = {
  Authorization: `Bearer ${localStorage.getItem('token')}`,
};
// 上传前校验
const beforeUpload = (file: File) => {
  const isImage = file.type.startsWith('image/');
  if (!isImage) {
    message.error('只能上传图片文件！');
    return false;
  }
  
  const isLt5M = file.size / 1024 / 1024 < 5;
  if (!isLt5M) {
    message.error('图片大小不能超过 5MB！');
    return false;
  }
  
  return true;
};
// 上传成功回调
const handleSuccess = (response: any) => {
  if (response.code === 200) {
    message.success('上传成功');
    console.log('文件URL:', response.data.url);
  } else {
    message.error(response.message);
  }
};
</script>
```

------

## 10. 安全最佳实践

### 10.1 配置 Bucket 防盗链

在阿里云控制台配置：

1. 进入 Bucket 详情页

2. 点击"访问控制" → "防盗链"

3. 添加白名单：

   ```
   https://your-domain.com
   https://www.your-domain.com
   ```

### 10.2 配置 CORS（跨域）



```json
[
  {
    "allowedOrigins": ["https://your-domain.com"],
    "allowedMethods": ["GET", "POST", "PUT", "DELETE"],
    "allowedHeaders": ["*"],
    "exposeHeaders": ["ETag"],
    "maxAgeSeconds": 3600
  }
]
```

### 10.3 配置生命周期规则

自动删除过期文件（如临时文件）：

1. 进入 Bucket 详情页
2. 点击"基础设置" → "生命周期"
3. 添加规则：
   - 前缀：`temp/`
   - 操作：删除
   - 天数：7 天

------

## 11. 总结

通过阿里云 OSS实现了：

- 安全的文件上传（类型校验、大小限制）
- 灵活的文件命名（UUID + 日期分类）
- 完善的错误处理
- 预签名 URL（限制访问时间）
- CDN 加速访问
