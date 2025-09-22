---
title: nvm 的安装和使用
date: 2025/9/8
tags:
 - nvm
categories:
 - 练习
---
# nvm 的安装和使用

## 1. 什么是 nvm？ 

开发时常常会遇到这样的问题：  
一个项目依赖于某个 Node.js 版本，另一个项目却依赖于更高或更低的版本。  
如果每次都重新安装/卸载 Node.js，会非常麻烦。  

**解决办法：**  
使用 **nvm**（Node Version Manager）。  
nvm 是一个 Node.js 的版本管理器，可以同时管理多个 Node.js 版本，并支持方便地切换。

---

## 2. nvm 安装

> ⚠️ **注意：安装 nvm 之前需要先卸载已经安装的 Node.js。**

### 2.1 安装包下载
前往 [nvm 官网](https://github.com/coreybutler/nvm-windows) 下载对应的安装包。

### 2.2 安装步骤
1. 解压 `nvm-setup.zip` 安装包，点击 `exe` 文件进行安装。  
2. 选择安装路径，例如：
   ```
   D:\HBBTJ\nvm
   ```
3. 设置 Node.js 的安装位置为：
   ```
   D:\HBBTJ\nvm\nodejs
   ```
4. 点击安装并等待完成。  

   安装完成后，进入 nvm 安装目录，编辑 `settings.txt` 文件，添加国内镜像源：
   ```txt
   node_mirror: http://npmmirror.com/mirrors/node/
   npm_mirror: http://registry.npmmirror.com/mirrors/npm/
   ```
   ![](https://java-ai-178.oss-cn-beijing.aliyuncs.com/HBBTJ/1.png)

---

### 2.3 配置环境变量

#### 用户变量
- 新增 `NVM_HOME` 和 `NVM_SYMLINK` 变量。
- 在 `Path` 中添加：
  ```
  %NVM_HOME%
  %NVM_SYMLINK%
  ```
  ![](https://java-ai-178.oss-cn-beijing.aliyuncs.com/HBBTJ/2.png)

#### 系统变量
- 同样新增 `NVM_HOME` 和 `NVM_SYMLINK` 变量。
- 在 `Path` 中添加：
  ```
  %NVM_HOME%
  %NVM_SYMLINK%
  ```
   ![](https://java-ai-178.oss-cn-beijing.aliyuncs.com/HBBTJ/3.png)

   完成后，打开终端，输入：
   ```bash
   nvm -v
   ```
   如果能输出版本号，则安装成功。

   ![](https://java-ai-178.oss-cn-beijing.aliyuncs.com/HBBTJ/4.png)

---

### 2.4 配置全局安装路径

1. 在 `D:\nvm` 下新建两个文件夹：
   ```
   node_global
   node_cache
   ```
2. 在命令行中执行以下命令：
   ```bash
   npm config set prefix "D:\nvm\node_global"
   npm config set cache "D:\nvm\node_cache"
   ```
   ![](https://java-ai-178.oss-cn-beijing.aliyuncs.com/HBBTJ/5.png)

3. 配置用户变量：  
   在 `Path` 中新增：
   ```
   D:\nvm\node_global
   ```
4. 配置系统变量：  
   新建 `NODE_PATH`，值为：
   ```
   D:\nvm\node_global\node_modules
   ```
   并在 `Path` 中新增：
   ```
   D:\nvm\node_global
   ```

> ✅ 这样以后全局安装的包都会放在 `D:\nvm\node_global` 下，而不是默认的 C 盘。

---

## 3. nvm 使用

### 3.1 安装指定 Node.js 版本
```bash
nvm install 14.15.0
nvm install <version>
```
![](https://java-ai-178.oss-cn-beijing.aliyuncs.com/HBBTJ/6.png)

### 3.2 卸载指定版本
```bash
nvm uninstall <version>
```
![](https://java-ai-178.oss-cn-beijing.aliyuncs.com/HBBTJ/7.png)

### 3.3 切换使用指定版本
```bash
nvm use <version>
```
![](https://java-ai-178.oss-cn-beijing.aliyuncs.com/HBBTJ/8.png)

### 3.4 列出所有已安装的版本
```bash
nvm ls
```
![](https://java-ai-178.oss-cn-beijing.aliyuncs.com/HBBTJ/9.png)

### 3.5 显示当前正在使用的版本
```bash
nvm current
```
![](https://java-ai-178.oss-cn-beijing.aliyuncs.com/HBBTJ/10.png)

### 3.6 显示所有可安装的 Node.js 版本
```bash
nvm list available
```
![](https://java-ai-178.oss-cn-beijing.aliyuncs.com/HBBTJ/11.png)

---

## 4. 常用命令速查表（Cheat Sheet）

| 功能             | 命令                      | 示例              |
| ---------------- | ------------------------- | ----------------- |
| 安装指定版本     | `nvm install <version>`   | `nvm install 18.18.2` |
| 卸载指定版本     | `nvm uninstall <version>` | `nvm uninstall 18.18.2` |
| 使用指定版本     | `nvm use <version>`       | `nvm use 18.18.2` |
| 查看已安装版本   | `nvm ls`                  |                   |
| 查看当前版本     | `nvm current`             |                   |
| 查看可安装版本   | `nvm list available`      |                   |

---

## 5. 总结

- nvm 是 **Node.js 版本管理器**，方便在多项目中切换不同 Node 版本。
- 安装前需卸载已有的 Node.js。
- 配置淘宝镜像可以加快安装速度。
- 配置全局安装路径，避免占用系统盘空间。
