---
title: MinIO 对象存储
date: 2026-01-27
tags:
 - MinIO  
 - Springboot
categories:
 - 项目实战
 - 练习
---

# MinIO 对象存储在微服务中的应用实战

## 一、背景介绍

在微服务架构中，图片、文档等静态资源的存储是一个常见需求。传统的文件系统存储存在以下问题：

1. **扩展性差**：单机存储容量有限，难以水平扩展
2. **高可用困难**：文件系统故障会导致服务不可用
3. **跨服务访问复杂**：多服务访问同一文件需要复杂的共享机制
4. **CDN 集成困难**：无法方便地与 CDN 集成加速访问

**解决方案**：引入 MinIO 对象存储，提供 S3 兼容的分布式存储服务。

------

## 二、MinIO vs 阿里云 OSS 对比

| 特性         | MinIO                    | 阿里云 OSS       |
| :----------- | :----------------------- | :--------------- |
| **部署方式** | 私有化部署（Docker/K8s） | 云服务           |
| **成本**     | 免费（仅服务器成本）     | 按流量/存储收费  |
| **性能**     | 高（本地网络）           | 依赖公网带宽     |
| **可控性**   | 完全自主可控             | 依赖云服务商     |
| **易用性**   | 需要自行运维             | 开箱即用         |
| **适用场景** | 开发测试、私有云         | 生产环境、公有云 |

**推荐策略**：

- **开发/测试环境**：使用 MinIO（降低成本，快速迭代）
- **生产环境**：使用阿里云 OSS（高可用，免运维）
- **混合架构**：代码支持动态切换（配置驱动）

------

## 三、MinIO 安装与配置

### 3.1 使用 Docker Compose 快速部署

创建 `docker-compose.yml` 文件：

```yaml
version: '3.8'

services:
  minio:
    image: minio/minio:latest
    container_name: motorcycle-club-minio
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: admin
      MINIO_ROOT_PASSWORD: 123456
    command: server /data --console-address ":9001"
    volumes:
      - minio-data:/data  # ← 持久化存储
    deploy:
      resources:
        limits:
          memory: 512M   # ← 最大 512MB
        reservations:
          memory: 256M   # ← 预留 256MB
    restart: unless-stopped
volumes:
  minio-data:  # ← Docker 自动使用 local 驱动
```

### 3.2 启动服务

```dockerfile
# 启动 MinIO
docker-compose up -d

# 查看日志
docker logs -f motorcycle-club-minio
```

### 3.3 访问 MinIO 控制台

访问 [http://localhost:9001](http://localhost:9001/)

- **用户名**：`admin`
- **密码**：`123456`

**首次使用步骤**：

1. 登录控制台
2. 创建 Bucket：`motorcycle-club`（设置为 Public 或 Private）
3. 创建 Access Keys（用于程序访问）

------

## 四、Spring Boot 项目配置

### 4.1 添加 Maven 依赖

在 **父 POM** (`pom.xml`) 中统一管理版本：



```xml
<properties>
    <minio.version>8.5.7</minio.version>
</properties>

<dependencyManagement>
    <dependencies>
        <!-- MinIO 客户端 -->
        <dependency>
            <groupId>io.minio</groupId>
            <artifactId>minio</artifactId>
            <version>${minio.version}</version>
        </dependency>
    </dependencies>
</dependencyManagement>
```

在 **子模块** (`content-service/pom.xml`) 中引入依赖：

```xml
<!-- MinIO -->
<dependency>
    <groupId>io.minio</groupId>
    <artifactId>minio</artifactId>
</dependency>
```

### 4.2 Nacos 配置中心统一配置

根据你的项目架构，有两种配置方式：

#### **方式一：直接在 application.yml 配置**

`content-service/src/main/resources/application.yml`：

```yaml
server:
  port: 8083
  address: 127.0.0.1

spring:
  application:
    name: content-service
  profiles:
    active: dev
  servlet:
    multipart:
      max-file-size: 10MB      # ✅ 限制单个文件大小
      max-request-size: 10MB   # ✅ 限制请求总大小

# ==================== 存储配置 ====================
storage:
  type: minio  # ✅ 切换存储方式：minio 或 aliyun

# MinIO 配置
minio:
  endpoint: http://127.0.0.1:9000
  access-key: admin        # ✅ 默认用户名
  secret-key: 123456        # ✅ 默认密码（生产环境请修改）
  bucket-name: motorcycle-club
  cdn-domain:                   # 可选，留空则使用 MinIO 默认域名

# 阿里云 OSS 配置（生产环境使用）
aliyun:
  oss:
    endpoint: oss-cn-beijing.aliyuncs.com
    access-key-id: ${ALIYUN_OSS_ACCESS_KEY_ID}
    access-key-secret: ${ALIYUN_OSS_ACCESS_KEY_SECRET}
    bucket-name: ${ALIYUN_OSS_BUCKET_NAME}
    cdn-domain: ${ALIYUN_OSS_CDN_DOMAIN}
```

**优点**：配置简单，适合单体服务或独立微服务
**缺点**：多服务需要重复配置

------

#### **方式二：使用 Nacos 统一配置（推荐微服务架构）**

如果你的项目使用了 Nacos 配置中心，建议将存储配置抽取为共享配置。

**步骤 1：创建 Nacos 共享配置**

在 Nacos 控制台创建配置文件 `storage-common.yml`（`DEFAULT_GROUP`）：

```yaml
# ==================== 存储配置（Nacos 共享配置）====================
storage:
  type: minio  # ✅ 动态切换：minio / aliyun

# MinIO 配置
minio:
  endpoint: http://127.0.0.1:9000
  access-key: admin
  secret-key: 123456
  bucket-name: motorcycle-club
  cdn-domain:

# 阿里云 OSS 配置
aliyun:
  oss:
    endpoint: oss-cn-beijing.aliyuncs.com
    access-key-id: ${ALIYUN_OSS_ACCESS_KEY_ID}
    access-key-secret: ${ALIYUN_OSS_ACCESS_KEY_SECRET}
    bucket-name: ${ALIYUN_OSS_BUCKET_NAME}
    cdn-domain: ${ALIYUN_OSS_CDN_DOMAIN}
```

**步骤 2：服务引入共享配置**

修改 `content-service/src/main/resources/bootstrap.yml`：

```yaml
spring:
  application:
    name: content-service
  cloud:
    nacos:
      discovery:
        server-addr: 127.0.0.1:8848
      config:
        server-addr: 127.0.0.1:8848
        file-extension: yml
        # ✅ 引入共享配置
        shared-configs:
          - data-id: jwt-common.yml
            group: DEFAULT_GROUP
            refresh: true
          - data-id: storage-common.yml  # ✅ 新增
            group: DEFAULT_GROUP
            refresh: true
```

**优点**：多服务共享配置，统一管理，支持动态刷新
**缺点**：需要搭建 Nacos 配置中心4.3 服务引入共享配置

------

## 五、代码实现

### 5.1 MinIO 配置类

```java
package com.example.content.config;

import io.minio.MinioClient;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * MinIO 配置类
 * @author yihui
 */
@Data
@Configuration
@ConfigurationProperties(prefix = "minio")
public class MinioConfig {

    /**
     * MinIO 服务端点
     */
    private String endpoint;

    /**
     * AccessKey
     */
    private String accessKey;

    /**
     * SecretKey
     */
    private String secretKey;

    /**
     * Bucket 名称
     */
    private String bucketName;

    /**
     * CDN 域名（可选）
     */
    private String cdnDomain;

    /**
     * 创建 MinIO 客户端 Bean
     */
    @Bean
    public MinioClient minioClient() {
        return MinioClient.builder()
                .endpoint(endpoint)
                .credentials(accessKey, secretKey)
                .build();
    }
}
```

### 5.2 MinIO 工具类

```java
package com.example.content.utils;

import com.example.content.config.MinioConfig;
import io.minio.*;
import io.minio.http.Method;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@Slf4j
@Component
@RequiredArgsConstructor
public class MinioUtil {

    private final MinioClient minioClient;
    private final MinioConfig minioConfig;

    private static final int URL_EXPIRATION_HOURS = 24;

    /**
     * 上传文件到 MinIO（✅ 返回文件路径，和 OssUtil 保持一致）
     */
    public String uploadFile(MultipartFile file, String folder) {
        try {
            String originalFilename = file.getOriginalFilename();
            if (originalFilename == null || originalFilename.isEmpty()) {
                throw new RuntimeException("文件名不能为空");
            }

            String extension = originalFilename.substring(originalFilename.lastIndexOf("."));
            String fileName = folder + "/" + UUID.randomUUID() + extension;

            ensureBucketExists();

            try (InputStream inputStream = file.getInputStream()) {
                minioClient.putObject(
                        PutObjectArgs.builder()
                                .bucket(minioConfig.getBucketName())
                                .object(fileName)
                                .stream(inputStream, file.getSize(), -1)
                                .contentType(file.getContentType())
                                .build()
                );
            }

            log.info("✅ [MinIO] 文件上传成功: {}", fileName);

            // ✅ 返回文件路径（和 OssUtil 保持一致）
            return fileName;  // 返回：HBBTJ/news/images/xxx.jpg

        } catch (Exception e) {
            log.error("❌ [MinIO] 上传失败", e);
            throw new RuntimeException("文件上传失败: " + e.getMessage(), e);
        }
    }

    /**
     * 生成签名 URL（和 OssUtil 保持一致）
     */
    public String generateSignedUrl(String fileUrl) {
        try {
            // ✅ 提取文件路径
            String fileName = extractFileName(fileUrl);

            String signedUrl = minioClient.getPresignedObjectUrl(
                    GetPresignedObjectUrlArgs.builder()
                            .method(Method.GET)
                            .bucket(minioConfig.getBucketName())
                            .object(fileName)
                            .expiry(URL_EXPIRATION_HOURS, TimeUnit.HOURS)
                            .build()
            );


            return signedUrl;

        } catch (Exception e) {
            log.error("❌ [MinIO] 生成签名 URL 失败: {}", fileUrl, e);
            throw new RuntimeException("生成签名 URL 失败: " + e.getMessage(), e);
        }
    }

    /**
     * 删除 MinIO 文件（和 OssUtil 保持一致）
     */
    public void deleteFile(String fileUrl) {
        try {
            if (fileUrl == null || fileUrl.isEmpty()) {
                throw new RuntimeException("文件路径不能为空");
            }

            // ✅ 提取文件路径
            String fileName = extractFileName(fileUrl);

            log.info("🔍 [MinIO] 准备删除文件: 原始URL={}", fileUrl);
            log.info("🔍 [MinIO] 提取的文件路径={}", fileName);

            minioClient.removeObject(
                    RemoveObjectArgs.builder()
                            .bucket(minioConfig.getBucketName())
                            .object(fileName)
                            .build()
            );

            log.info("✅ [MinIO] 文件删除成功: {}", fileName);

        } catch (Exception e) {
            log.error("❌ [MinIO] 删除文件失败: fileUrl={}", fileUrl, e);
            throw new RuntimeException("删除文件失败: " + e.getMessage(), e);
        }
    }

    /**
     * 检查文件是否存在（和 OssUtil 保持一致）
     */
    public boolean doesFileExist(String filePath) {
        try {
            minioClient.statObject(
                    StatObjectArgs.builder()
                            .bucket(minioConfig.getBucketName())
                            .object(filePath)
                            .build()
            );
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    // ==================== 私有辅助方法 ====================

    /**
     * 确保 Bucket 存在
     */
    private void ensureBucketExists() {
        try {
            boolean exists = minioClient.bucketExists(
                    BucketExistsArgs.builder()
                            .bucket(minioConfig.getBucketName())
                            .build()
            );

            if (!exists) {
                minioClient.makeBucket(
                        MakeBucketArgs.builder()
                                .bucket(minioConfig.getBucketName())
                                .build()
                );

                String policy = """
                    {
                      "Version": "2012-10-17",
                      "Statement": [
                        {
                          "Effect": "Allow",
                          "Principal": {"AWS": ["*"]},
                          "Action": ["s3:GetObject"],
                          "Resource": ["arn:aws:s3:::%s/*"]
                        }
                      ]
                    }
                    """.formatted(minioConfig.getBucketName());

                minioClient.setBucketPolicy(
                        SetBucketPolicyArgs.builder()
                                .bucket(minioConfig.getBucketName())
                                .config(policy)
                                .build()
                );

                log.info("✅ [MinIO] bucket 创建成功: {}", minioConfig.getBucketName());
            }
        } catch (Exception e) {
            log.error("❌ [MinIO] Bucket 操作失败", e);
            throw new RuntimeException("Bucket 操作失败: " + e.getMessage(), e);
        }
    }

    /**
     * ✅ 从 URL 提取文件路径（和 OssUtil 保持一致）
     */
    private String extractFileName(String fileUrl) {
        // 步骤 1：先清除签名参数
        if (fileUrl.contains("?")) {
            fileUrl = fileUrl.substring(0, fileUrl.indexOf("?"));
            log.debug("🔍 [MinIO] 清除签名参数后: {}", fileUrl);
        }

        // 步骤 2：处理 CDN 域名
        if (minioConfig.getCdnDomain() != null
                && !minioConfig.getCdnDomain().isEmpty()
                && fileUrl.contains(minioConfig.getCdnDomain())) {
            String result = fileUrl.substring(
                    fileUrl.lastIndexOf(minioConfig.getCdnDomain())
                            + minioConfig.getCdnDomain().length() + 1
            );
            log.debug("🔍 [MinIO] 从 CDN URL 提取路径: {}", result);
            return result;
        }

        // 步骤 3：处理 MinIO 默认域名
        // 格式：http://127.0.0.1:9000/motorcycle-club/HBBTJ/news/images/xxx.jpg
        if (fileUrl.contains("/" + minioConfig.getBucketName() + "/")) {
            String result = fileUrl.substring(
                    fileUrl.lastIndexOf("/" + minioConfig.getBucketName() + "/")
                            + minioConfig.getBucketName().length() + 2
            );
            log.debug("🔍 [MinIO] 从默认 URL 提取路径: {}", result);
            return result;
        }

        // 步骤 4：如果已经是文件路径，直接返回
        log.debug("🔍 [MinIO] 直接使用原始路径: {}", fileUrl);
        return fileUrl;
    }
}
```

### 5.3 文件上传控制器（支持动态切换）

```java
package com.example.content.controller;

import com.example.common.annotation.RateLimit;
import com.example.common.exception.SpringException;
import com.example.common.result.HttpResult;
import com.example.content.utils.MinioUtil;
import com.example.content.utils.OssUtil;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.*;

/**
 * 文件上传控制器（支持 OSS 和 MinIO 动态切换）
 * @author yihui
 */
@Slf4j
@RestController
@RequestMapping("/upload")
@Tag(name = "文件上传", description = "图片上传相关接口")
public class OssUploadController {

    @Value("${storage.type:minio}")  // ✅ 默认使用 MinIO
    private String storageType;

    @Autowired(required = false)
    private OssUtil ossUtil;

    @Autowired(required = false)
    private MinioUtil minioUtil;

    private static final List<String> ALLOWED_EXTENSIONS = Arrays.asList(
            "jpg", "jpeg", "png", "gif", "webp", "bmp"
    );
    private static final long MAX_FILE_SIZE = 5 * 1024 * 1024;  // 5MB

    /**
     * ✅ 动态选择存储工具
     */
    private Object getStorageUtil() {
        if ("minio".equalsIgnoreCase(storageType)) {
            if (minioUtil == null) {
                throw new SpringException("MinIO 未配置，请检查配置文件", 500);
            }
            return minioUtil;
        } else if ("aliyun".equalsIgnoreCase(storageType)) {
            if (ossUtil == null) {
                throw new SpringException("阿里云 OSS 未配置，请检查配置文件", 500);
            }
            return ossUtil;
        } else {
            throw new SpringException("未知的存储类型: " + storageType, 500);
        }
    }

    /**
     * 上传新闻图片
     */
    @PostMapping("/news-image")
    @RateLimit(key = "upload_image", time = 60, count = 10)
    @Operation(summary = "上传新闻图片")
    public HttpResult<Map<String, String>> uploadNewsImage(
            @RequestParam("file") MultipartFile file) {
        
        log.info("收到图片上传请求，文件名: {}, 大小: {} bytes, 存储类型: {}",
                file.getOriginalFilename(), file.getSize(), storageType);

        // 校验文件
        validateFile(file);
        validateFileSize(file);
        String originalFilename = file.getOriginalFilename();
        validateFileName(originalFilename);
        validateFileExtension(originalFilename);
        validateContentType(file);

        try {
            String filePath;
            Object storage = getStorageUtil();

            // ✅ 根据存储类型调用对应的上传方法
            if (storage instanceof OssUtil) {
                filePath = ((OssUtil) storage).uploadFile(file, "HBBTJ/news/images");
                log.info("✅ [OSS] 图片上传成功: {}", filePath);
            } else if (storage instanceof MinioUtil) {
                filePath = ((MinioUtil) storage).uploadFile(file, "HBBTJ/news/images");
                log.info("✅ [MinIO] 图片上传成功: {}", filePath);
            } else {
                throw new SpringException("未知的存储类型", 500);
            }

            Map<String, String> result = new HashMap<>();
            result.put("url", filePath);
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
        log.info("🔍 收到删除请求: url={}, storageType={}", url, storageType);
        
        validateUrl(url);
        
        try {
            Object storage = getStorageUtil();
            
            if (storage instanceof OssUtil) {
                ((OssUtil) storage).deleteFile(url);
                log.info("✅ [OSS] 图片删除成功: {}", url);
            } else if (storage instanceof MinioUtil) {
                ((MinioUtil) storage).deleteFile(url);
                log.info("✅ [MinIO] 图片删除成功: {}", url);
            }
            
            return HttpResult.ok("删除成功");
            
        } catch (Exception e) {
            log.error("❌ 删除图片失败: url={}", url, e);
            throw new SpringException("删除失败: " + e.getMessage(), 500);
        }
    }

    /**
     * 生成签名 URL（用于访问私有文件）
     */
    @GetMapping("/sign-url")
    @Operation(summary = "根据文件路径生成签名URL")
    public HttpResult<String> generateSignedUrl(@RequestParam String filePath) {
        log.debug("收到签名请求: filePath={}, 存储类型: {}", filePath, storageType);

        try {
            String signedUrl;
            Object storage = getStorageUtil();

            if (storage instanceof OssUtil) {
                signedUrl = ((OssUtil) storage).generateSignedUrl(filePath);
            } else if (storage instanceof MinioUtil) {
                signedUrl = ((MinioUtil) storage).generateSignedUrl(filePath);
            } else {
                throw new SpringException("未知的存储类型", 500);
            }

            return HttpResult.ok(signedUrl);

        } catch (Exception e) {
            log.error("生成签名 URL 失败: {}", filePath, e);
            return HttpResult.error(500, "生成签名 URL 失败");
        }
    }

    // ==================== 私有校验方法 ====================

    @SuppressWarnings("ConstantConditions")
    private void validateFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new SpringException("请选择要上传的文件", 400);
        }
    }

    private void validateFileSize(MultipartFile file) {
        if (file.getSize() > MAX_FILE_SIZE) {
            throw new SpringException("文件大小不能超过5MB", 400);
        }
    }

    @SuppressWarnings("ConstantConditions")
    private void validateFileName(String filename) {
        if (filename == null || filename.isEmpty()) {
            throw new SpringException("文件名不能为空", 400);
        }
    }

    private void validateFileExtension(String filename) {
        String extension = getFileExtension(filename);
        if (!ALLOWED_EXTENSIONS.contains(extension)) {
            throw new SpringException(
                "只支持 JPG、PNG、GIF、WEBP、BMP 格式的图片", 400);
        }
    }

    @SuppressWarnings("ConstantConditions")
    private void validateContentType(MultipartFile file) {
        String contentType = file.getContentType();
        if (contentType == null || !contentType.startsWith("image/")) {
            throw new SpringException("只能上传图片文件", 400);
        }
    }

    private void validateUrl(String url) {
        if (url == null || url.isEmpty()) {
            throw new SpringException("图片URL不能为空", 400);
        }
    }

    private String getFileExtension(String filename) {
        if (filename == null || !filename.contains(".")) {
            return "";
        }
        return filename.substring(filename.lastIndexOf(".") + 1).toLowerCase();
    }
}
```

------

## 六、核心优势总结

### 6.1 MinIO 优势

| 特性         | 说明                                   |
| :----------- | :------------------------------------- |
| **S3 兼容**  | 完全兼容 AWS S3 API，代码可无缝迁移    |
| **高性能**   | 单机可达 TB/s 级别吞吐量               |
| **易部署**   | Docker 一键部署，5 分钟搭建完成        |
| **零成本**   | 开源免费，仅需服务器成本               |
| **数据安全** | 支持纠删码（Erasure Code）和位衰减保护 |

### 6.2 动态切换存储方案的优势

```
开发环境 ──> MinIO（本地测试，快速迭代）
   ↓
测试环境 ──> MinIO（降低成本）
   ↓
生产环境 ──> 阿里云 OSS（高可用，免运维）
```

**代码零改动**：只需修改配置文件 `storage.type` 即可切换

------

## 七、验证与监控

### 7.1 MinIO 控制台监控

访问 [http://localhost:9001](http://localhost:9001/) 查看：

- **存储容量**：当前使用量/总容量
- **请求统计**：上传/下载次数
- **文件浏览**：可视化管理文件
- **访问日志**：查看访问记录

### 7.2 API 测试

#### 上传测试

```json
curl -X POST http://localhost:8080/upload/news-image \
  -H "Authorization: Bearer your-token" \
  -F "file=@test.jpg"

# 响应示例
{
  "code": 200,
  "message": "success",
  "data": {
    "url": "HBBTJ/news/images/xxxxx-uuid.jpg",
    "name": "test.jpg",
    "size": "102400"
  }
}
```

#### 生成签名 URL 测试

```json
curl -X GET "http://localhost:8080/upload/sign-url?filePath=HBBTJ/news/images/xxxxx.jpg" \
  -H "Authorization: Bearer your-token"

# 响应示例
{
  "code": 200,
  "data": "http://127.0.0.1:9000/motorcycle-club/HBBTJ/news/images/xxxxx.jpg?X-Amz-Algorithm=..."
}
```

#### 删除测试



```json
curl -X DELETE "http://localhost:8080/upload/delete?url=HBBTJ/news/images/xxxxx.jpg" \
  -H "Authorization: Bearer your-token"

# 响应示例
{
  "code": 200,
  "message": "删除成功"
}
```

### 7.3 日志监控

```
✅ [MinIO] 文件上传成功: HBBTJ/news/images/xxxxx.jpg
✅ [MinIO] 生成签名 URL: HBBTJ/news/images/xxxxx.jpg
✅ [MinIO] 文件删除成功: HBBTJ/news/images/xxxxx.jpg
```