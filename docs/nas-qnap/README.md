# NAS QNAP 家庭反代（示例：`https://nas.example.com:8443`）

| 文档 | 说明 |
|------|------|
| [技术迭代-阶段一反代.md](./技术迭代-阶段一反代.md) | NPM 路径规划、部署与验收 |

关联仓库：`sub-web`（`/subw/`）、`SubConverter-Extended`（`/subapi`）。

部署脚本内网 IP / 公网域名通过环境变量 `NAS_LAN_IP`、`NAS_PUBLIC_HOST` 注入，勿将真实地址提交到 Git。
