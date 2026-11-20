# 渠订通

> 面向批发商、渠道商与门店的轻量化进销存与订货系统  
> 前台报价下单 · 后台开单 · 库存 · 退货 · 账单 · 财务对账 · 打印出单

渠订通是一套基于 Node.js 24 的自托管业务系统，采用原生 SPA + SQLite，零 npm 运行时依赖，适合批发订货、客户报价、渠道价格、订单打印、应收应付和库存管理场景。

## 功能概览

### 前台客户

- 登录后查看商品报价、分类、品牌、库存与商品详情
- 搜索商品、加入购物车、提交订单
- 我的订单、我的账单、退货申请、收款信息、账号资料
- 按客户等级展示零售 / 渠道 / 核心价格
- 商品规则和自定义说明实时同步

### 后台经营

- 总览经营指标、销售统计、商品销量统计
- 订单管理、订单明细、打印队列、待出单状态
- 手动开单、商品金额手动修改、草稿保存与重开
- 商品上架、分类品牌、价格规则、库存、序列号、备注
- 采购入库、供应商、应付账单、付款核销
- 库存台账、盘点、报损报溢、借出返回
- 退货审核、后台按商品退货、库存回仓、金额冲减
- 账单财务、应收应付、对账财务、收支流水、账期提醒
- 往来明细查询：按客户 / 公司 / 零售客户 / 供应商 / 日期 / 单号 / 类型汇总全部单据
- 客户管理、员工权限、通知弹窗、前台设置、打印设置、安全中心、备份恢复

### 技术与安全

- Node.js 24 + node:sqlite + 原生 SPA
- 零 npm 运行时依赖
- SQLite WAL / FULL / 事务重试 / 多进程 cluster
- 独立安全库、CSRF、会话撤销、登录限流、接口限流、审计哈希链
- 加密备份、非 root Docker 运行、严格 CSP
- 统一永久授权机制：官方公钥与授权服务地址内置，备份不会携带授权状态

## 快速部署

### Docker Compose

```bash
mkdir -p /opt/qudingtong/data/security /opt/qudingtong/backups
cd /opt/qudingtong
curl -O https://raw.githubusercontent.com/xiaolurenya/qudingtong/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/xiaolurenya/qudingtong/main/.env.example
cp .env.example .env
docker compose up -d
```

访问：

```text
http://服务器IP:8282
```

首次启动后请立即修改默认管理员密码，并在正式环境中启用 HTTPS 与 `QDT_SECURE_COOKIE=1`。

## 镜像

当前发布版本：

```text
xiaoluya/qudingtong:1.3.4
xiaoluya/qudingtong:latest
```

当前镜像摘要：`sha256:b95f7023b8b0c001d198a213620598315269945d1e39c4c7535c9a6356f0b600`

## 初始账号

系统首次启动会按 `.env` 中的 `BOOTSTRAP_ADMIN_PASSWORD` 创建管理员，并生成内置员工/演示账号。生产环境请在首次登录后立即修改所有初始凭据；公开文档不再提供固定口令。

## 数据与备份

- 主数据库：`./data/qudingtong.db`
- 独立安全库：`./data/security/qudingtong-security.db`
- 加密备份：`./backups`
- 请勿执行 `docker compose down -v`
- 备份恢复不会迁移授权码、设备指纹或会话，换机后需重新激活

## 授权

系统采用统一永久授权。试用状态可体验基础流程；正式使用请在后台「安全中心 / 授权信息」复制机器码并联系作者获取激活码。

授权与备份说明：

- 激活码使用 Ed25519 签名校验
- 官方公钥与授权服务地址内置，不接受环境变量或设置表覆盖
- 激活前会同步官方配置与吊销清单
- 备份不包含授权码、设备指纹、会话和密钥材料
- 导出备份到另一台机器不会自动激活

## 文档

- [部署说明](docs/部署说明.md)
- [宝塔部署](docs/宝塔部署.md)

## 仓库

- 公开安装仓：<https://github.com/xiaolurenya/qudingtong>
- Docker Hub：<https://hub.docker.com/r/xiaoluya/qudingtong>

---

文档版本：1.3.4 · 发布校验通过。
