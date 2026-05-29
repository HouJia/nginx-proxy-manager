# NAS QNAP 家庭反代（示例：`https://nas.example.com:8443`）

| 文档 | 说明 |
|------|------|
| [技术迭代-阶段一反代.md](./技术迭代-阶段一反代.md) | NPM 路径规划、部署与验收 |

关联仓库：`sub-web`（`/subw/`）、`SubConverter-Extended`（`/subapi`）。

## 分支

| 分支 | 用途 |
|------|------|
| **`hjsmaster`** | **HouJia 家庭 NAS 反代主线**（与 SubConverter-Extended、sub-web 同名）；clone 后默认 checkout 此分支 |
| `develop` | 上游 Nginx Proxy Manager 默认开发线；**不含** HouJia `/subapi` 脚本 |
| `feature/nas-qnap-phase1-proxy` | 历史开发分支，已合入 `hjsmaster`；勿再作为部署入口 |

部署脚本内网 IP / 公网域名通过环境变量 `NAS_LAN_IP`、`NAS_PUBLIC_HOST` 注入，勿将真实地址提交到 Git。
