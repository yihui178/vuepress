import { defineUserConfig } from "vuepress";
import recoTheme from "vuepress-theme-reco";
import { viteBundler } from '@vuepress/bundler-vite'
import { webpackBundler } from '@vuepress/bundler-webpack'

export default defineUserConfig({
  base: '/vuepress/',
  head: [
    ['link', { rel: 'icon', href: '/YihuiLogo.ico' }] // 这里的路径是指向 public 目录下的文件
  ],
  title: "忆\u200C回",
  description: "Just playing around",
  bundler: viteBundler(),
  // bundler: webpackBundler(),

  theme: recoTheme({
    
    

    logo: "/YihuiLogo.png",
    author: " 忆\uFEFF回",
    authorAvatar: "/lqxhead.png",

    docsRepo: "https://github.com/yihui178/vuepress",
    repo: "",
    // repoLabel: "Gitee",

    docsBranch: "main", 
    docsDir: "example",
    lastUpdatedText: "", 

    // colorMode: 'pink', // dark, light, 默认 auto
    // colorModeSwitch: true, // 是否展示颜色模式开关，默认 true

    // series 为原 sidebar
    series: {
      "/docs/theme-reco/": [
        {
          text: "练习",
          children: [
            "test/doker/docker",
            "test/git/git",
            "test/nvm/README1"
          ],
        },
        {
          text: "项目实战",
          children: ["test/springboot/springboot",
            "test/springboot/Swagger",
            "test/springboot/MyBatis-Plus",
          ],
        },
      ],
    },
    navbar: [
      { text: "主页", link: "/"},
      { text: "时间轴", link: "/timeline.html" },
      { text: "测试", link: "/categories/lianxi/1.html"},
      { text: "标签", link: "/tags/nvm/1.html"},
      {
        text: "练习",
        children: [
          { text: "测试", link: "/docs/theme-reco/theme" },
          { text: "关于", link: "/blogs/other/guide" },
        ],
      }  
    ],
    
    // 公告栏
    // bulletin: {
    //   body: [
    //     {
    //       type: "text",
    //       content: `🎉🎉🎉 reco 主题 2.x 已经接近 Beta 版本，在发布 Latest 版本之前不会再有大的更新，大家可以尽情尝鲜了，并且希望大家在 QQ 群和 GitHub 踊跃反馈使用体验，我会在第一时间响应。`,
    //       style: "font-size: 12px;",
    //     },
    //     {
    //       type: "hr",
    //     },
    //     {
    //       type: "title",
    //       content: "QQ 群",
    //     },
    //     {
    //       type: "text",
    //       content: `
    //       <ul>
    //         <li>QQ群1：1037296104</li>
    //         <li>QQ群2：1061561395</li>
    //         <li>QQ群3：962687802</li>
    //       </ul>`,
    //       style: "font-size: 12px;",
    //     },
    //     {
    //       type: "hr",
    //     },
    //     {
    //       type: "title",
    //       content: "GitHub",
    //     },
    //     {
    //       type: "text",
    //       content: `
    //       <ul>
    //         <li><a href="https://github.com/vuepress-reco/vuepress-theme-reco-next/issues">Issues<a/></li>
    //         <li><a href="https://github.com/vuepress-reco/vuepress-theme-reco-next/discussions/1">Discussions<a/></li>
    //       </ul>`,
    //       style: "font-size: 12px;",
    //     },
    //     {
    //       type: "hr",
    //     },
    //     {
    //       type: "buttongroup",
    //       children: [
    //         {
    //           text: "打赏",
    //           link: "/docs/others/donate.html",
    //         },
    //       ],
    //     },
    //   ],
    // },
    // commentConfig: {
    //   type: 'valine',
    //   // options 与 1.x 的 valineConfig 配置一致
    //   options: {
    //     // appId: 'xxx',
    //     // appKey: 'xxx',
    //     // placeholder: '填写邮箱可以收到回复提醒哦！',
    //     // verify: true, // 验证码服务
    //     // notify: true,
    //     // recordIP: true,
    //     // hideComments: true // 隐藏评论
    //   },
    // },
  }),
  // debug: true,
});
