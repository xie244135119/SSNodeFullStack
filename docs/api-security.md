# API 安全方案：双轨鉴权（JWT + 大屏签名加密）

> 状态:已沟通定稿,待落地
> 日期:2026-08-05
> 关联:[design.md](./design.md) §后台服务
>
> **实施范围(分期)**:
> - **本期**:只做请求侧签名。大屏接口均为 GET,无请求 body,故实际仅 `ts + nonce + HMAC-SHA256 签名`,防重放+防篡改。
> - **后期(暂缓)**:响应体 AES-GCM 加密、POST/PUT 请求 body 加密。待大屏前端真正接入 API 时同步实施,届时端到端可验证。
> - 本期不做响应加密 → backend **不改 `TransformInterceptor`**;`appSign.cryptKey` 字段保留但不启用;前端响应拦截器不解密。
> - **前端 crypto 实现一律纯 JS,禁用 `crypto.subtle`**(生产纯 HTTP 不安全上下文下不可用,见 §2.2/§5.4)。

## 一、背景

web 端两个场景,对应 backend 两套 API 安全机制:

| 场景 | 入口 | 鉴权机制 |
|---|---|---|
| 后台管理系统 | `/background` (AuthLayout) | **JWT** — 登录发 token,`Authorization: Bearer <token>`,8h 过期,`@UseGuards(JwtAuthGuard)` |
| 可视化大屏 | `/screen` (ScreenLayout) | **大屏签名加密** — 无 token、无过期,HMAC 签名 + AES-GCM 加密 |

本文档只设计**大屏签名加密**这套新增机制,JWT 那套已实现不动。

### 1.1 现状盘点(评审已核实)

- JWT 链路完整:`auth.controller` → `auth.service.login` → `JwtAuthGuard` + `JwtStrategy`(`fromAuthHeaderAsBearerToken`),yaml `jwt.secret/expiresIn`。
- 大屏接口目前**完全裸奔**:
  - `GET /api/power-history/screen` — 无 `@UseGuards`
  - `GET /api/service-data/screen` — 无 `@UseGuards`
  - `GET /api/screen/list` — 无 `@UseGuards`(本次暂不纳入,见 §6)
  - `GET /api/getList` (page-data) — 无 `@UseGuards`(本次暂不纳入)
- 全局已有:`/api` 前缀、`AppThrottlerGuard`(按 IP 60/min,白名单放行)、统一响应体 `{code,message,data}`(`TransformInterceptor`)。
- 前端请求层:`web/src/services/request.ts`(axios 单例,后台用,带 `Authorization`)。

### 1.2 已锁定决策(用户拍板)

| 决策点 | 选择 | 说明 |
|---|---|---|
| 「无过期」含义 | **密钥永不过期 + 单请求有时效窗口** | `appSign.signKey/cryptKey` 长期有效不刷新;但每个请求带时间戳+nonce,5 分钟窗口内有效防重放。大屏前端无感(无需刷新 token)。 |
| 密钥注入 | **构建期硬编码进 bundle** | `VITE_APP_SIGN_KEY` / `VITE_APP_CRYPT_KEY` 编译期注入,运行时无网络获取动作。 |
| 内容加密 | **叠加 AES-256-GCM(后期,暂缓)** | 本期只做请求侧签名;POST/PUT body 与响应体加密后期同步实施。 |
| 保护范围 | **`/api/power-history/screen`、`/api/service-data/screen`** | 仅这俩大屏消费接口纳入。`/screen/list`、`/getList` 暂不动(见 §6)。 |

## 二、安全模型与边界

### 2.1 威胁覆盖

| 威胁 | 是否覆盖 | 机制 |
|---|---|---|
| 被动抓包看明文 | ⏳ 后期 | 响应体 AES-GCM 加密后期实施;本期大屏接口明文返回(数据本就公开展示) |
| 重放请求 | ✅ | 时间戳窗口 + nonce 去重 |
| 篡改 URL 参数 / body | ✅ | HMAC-SHA256 签名覆盖 method+path+query+ts+nonce+bodyCipher |
| 伪造请求 | ✅ | 签名密钥不泄露则无法伪造 |
| 逆向 bundle 抠密钥 | ❌ | 客户端持密钥方案的根本上限(见 §2.3) |

### 2.2 密钥与算法

- **signKey**:HMAC-SHA256 签名密钥,32+ 字符随机串,**永不过期**。**本期启用。**
- **cryptKey**:AES-256-GCM 内容加密密钥,base64(32 字节)。**后期启用,本期保留配置不启用。**
- **分立原则**:签名密钥只做完整性,加密密钥只做保密性,职责分离。一把泄露不影响另一层。
- **算法选择**:
  - 签名:HMAC-SHA256(对长度扩展攻击免疫,优于裸 `SHA256(key+msg)`)。**本期。**
  - 加密:AES-256-GCM(认证加密,authTag 自带完整性,IV 不重复即安全)。**后期。**
  - 前端:**纯 JS 实现,禁用 WebCrypto**。生产纯 HTTP 部署(无 TLS),`crypto.subtle` 仅在安全上下文(https/localhost)可用,局域网 IP 下恒为 `undefined` → 签名/解密抛错、请求发不出。签名用 `js-sha256`(`sha256.hmac(key,msg)`,与后端 Node `createHmac` 逐字节一致,已验证);后期 AES-GCM 同样用纯 JS 库(如 `aes-js`),不用 `crypto.subtle`。
  - 后端:Node 原生 `crypto`。

### 2.3 安全性天花板(诚实声明)

密钥编进前端 bundle,**任何决心逆向的人都能从 bundle 抠出 signKey/cryptKey**。这套机制的定位是:

- ✅ 防被动抓包看明文
- ✅ 防重放、防篡改、防爬虫随手刷
- ✅ 抬高逆向成本(不像裸 `/screen` 接口 F12 复制 curl 即可)
- ❌ 防不住有动机、会扒 bundle 的定向攻击者

这是「客户端持密钥」方案的根本上限。要再上一档得走后端发短期凭证(违背「无过期」既定决策),不在本次范围。

### 2.4 拼接方式安全性评估

签名串用 `\n` 分隔逐字段拼接。安全性结论:**当前字段集下安全,无拼接歧义/字段漂移攻击面**。

逐字段看,没有一个字段能合法包含分隔符 `\n`:

| 字段 | 取值空间 | 能含 `\n`? |
|---|---|---|
| METHOD | GET/POST/PUT | 否(固定词表) |
| PATH | URL path | 否(HTTP 解析器拒绝请求行 CR/LF) |
| SORTED_QUERY | percent-encoded 串 | 否(只要值是百分号编码的) |
| TS | 纯数字 | 否 |
| NONCE | hex | 否 |
| BODY_CIPHER_B64 | base64 | 否(base64 字母表无换行) |

故攻击者无法靠往某字段塞 `\n` 把后续字段「吃掉」重新切分,拼接是确定的。

**真正的工程风险在规范化契约**,两边必须产出逐字节相同的串(见 §3.3 契约)。字段集若将来扩展到含可变分隔符的值,可退化为**长度前缀**拼接(`len(M):M\nlen(P):P\n...`)彻底消除歧义,当前字段集不需要。

**Encrypt-then-MAC 顺序正确**:签名覆盖的是 body 密文的 base64,不是明文 body——AEAD 组合推荐顺序(优于 MAC-then-Encrypt,少 padding oracle 类问题)。响应侧用 GCM authTag 自带完整性,不必再叠 HMAC。

## 三、协议设计

### 3.1 请求协议(大屏 → backend)

每个受保护请求带以下头:

| Header | 值 | 本期 | 后期 |
|---|---|---|---|
| `X-App-Ts` | Unix 秒 | ✅ | |
| `X-App-Nonce` | 16 hex 随机 | ✅ | |
| `X-App-Sign` | HMAC-SHA256(签名串, signKey) → hex | ✅ | |
| `X-App-Iv` | base64(12 字节 GCM IV) | — | POST/PUT 有 body 时 |
| `X-App-Tag` | base64(16 字节 GCM authTag) | — | POST/PUT 有 body 时 |
| `Content-Type` | `text/plain` | — | 加密 body 时 |

> 本期大屏受保护接口均为 GET(`/power-history/screen`、`/service-data/screen`),无请求 body,故实际只用 `ts + nonce + sign` 三件套。`X-App-Iv`/`X-App-Tag`/加密 body 后期 POST-PUT 场景才启用。

### 3.2 签名串构造

按行拼接,`\n` 分隔,共 6 段:

```
METHOD
PATH            # /api/power-history/screen,不含 query,原始 path 不归一化
SORTED_QUERY    # key 字典序升序,k=v 用 & 连,值保持百分号编码原样不 decode,空 query 为空串
TS
NONCE
BODY_CIPHER_B64 # POST/PUT 加密后 base64;GET 留空串
```

- **GET**:body 段为空,签名覆盖 `method+path+query+ts+nonce`,防篡改 URL 参数。**本期即此场景。**
- **POST/PUT**(后期):先 AES-256-GCM 加密 JSON body → `base64(ciphertext)`,签名串末尾带这段密文,确保任何改动都让签名失效。

### 3.3 规范化契约(两边必须逐字节一致)

| 项 | 契约 |
|---|---|
| METHOD | 大写原值 |
| PATH | 原始 `req.url` 切出的 path,**不做归一化**(`/api/x` vs `/api//x` 不等价,直接用原值) |
| SORTED_QUERY | **直接用收到的原始 query 字符串按 key 排序后的形式,两边都不 decode**;重复 key 拒绝;空 query 为空串 |
| TS | 纯数字字符串 |
| NONCE | hex 字符串 |
| BODY_CIPHER_B64 | base64 字符串 |

> QUERY 不 decode 的原因:任何一边 decode 后再 encode 的编码可能与对端不同,产生签名覆盖语义不一致的串。直接用原始编码串最稳。

### 3.4 响应协议(backend → 大屏)

**后期实施,本期不做。** backend 当前直接返回明文 `{code,message,data}`(`TransformInterceptor` 不改)。

后期设计(储备):

| Header | 值 |
|---|---|
| `X-App-Resp-Iv` | base64(12 字节 GCM IV) |
| `X-App-Resp-Tag` | base64(16 字节 authTag) |
| body | base64(ciphertext) |

前端拿到后用 `cryptKey` + Iv + Tag 解密 → `{code,message,data}` → 走原有 `ResponseItem` 解析逻辑。

> 每个 response 用**新生成**的 12 字节 IV,不复用请求里的 IV(GCM 安全要求 IV 不重复)。

## 四、backend 实现设计

### 4.1 配置(yaml 新增 `appSign` 段)

> 段名用 `appSign` 不用 `app`——`config.interface.ts` 里 `app` 段已被占用(port/globalPrefix/corsOrigins)。

```yaml
appSign:
  signKey:  "<32+字符随机串>"   # HMAC-SHA256 签名密钥,永不过期
  cryptKey: "<base64(32字节)>"  # AES-256-GCM 内容加密密钥
  tsWindow: 300                 # 时间戳允许偏差(秒),±5min
```

`config.interface.ts` 加对应类型字段。

### 4.2 校验流程(`AppSignGuard`,新)

挂在 `@UseGuards(AppSignGuard)` 的路由上,与 `JwtAuthGuard` 并列互斥(大屏接口用这套,后台接口继续用 JWT)。**本期只做签名校验**(无 body 解密、无响应加密)。守卫执行顺序:

1. **时间戳校验**:`|now - ts| ≤ tsWindow(300)` → 否则 401「请求过期」
2. **nonce 去重**:内存 LRU(key=`nonce`,TTL=300s)查存在则 401「重复请求」;通过后写入
3. **签名比对**:用同样的签名串(method+path+sortedQuery+ts+nonce,body 段空)重算 HMAC,`crypto.timingSafeEqual` 比对 → 不符 401「签名错误」

校验通过即放行,controller 照常返回明文 `{code,message,data}`。

> 后期扩展:body 解密(POST/PUT)+ `req.appEncrypted` 打标记,供响应拦截器加密。本期不实现。

### 4.3 响应加密(后期,暂缓)

本期 **不改 `TransformInterceptor`**。后期实施时:正常包成 `{code,message,data}`,若 `req.appEncrypted` 为真则 AES-GCM 加密整个 envelope,设响应头、body 换成 base64 密文;否则原样(后台接口不受影响)。

### 4.4 nonce 存储

当前单实例 + SQLite,**内存 Map + TTL**(`setInterval` 清过期)即可,重启丢失可接受(窗口仅 5min,攻击者要重放必须在窗口内且 nonce 已被记)。将来若多实例,换 Redis `SETNX + EX`。现在不上。

### 4.5 限流

这两个 `/screen` 路由**不加** throttle 白名单(要限流,大屏轮询频率可控)。

## 五、web 实现设计

### 5.1 密钥注入

- `web/.env` / `project.config`:`VITE_APP_SIGN_KEY` / `VITE_APP_CRYPT_KEY`
- 构建期注入 bundle,运行时无网络获取动作。

### 5.2 独立请求实例(`services/app-request.ts`,新)

独立 axios 实例(不复用后台用的 `request` 单例,避免 `Authorization` 头污染):

- **请求拦截器**:生成 ts/nonce → GET 直接签 / POST-PUT 先 AES-GCM 加密 body 再签 → 设 `X-App-*` 头
- **响应拦截器**:用 `X-App-Resp-Iv`/`X-App-Resp-Tag` 解密 body → 返回 `{code,message,data}` → 走原有 `ResponseItem` 解析

### 5.3 接口切换

- `services/api/power-history.ts`:`screenList()` 改用 `appRequest`
- `services/api/service-data.ts`:`screenList()` 改用 `appRequest`

### 5.4 crypto 库

前端**禁用 WebCrypto `crypto.subtle`**,改纯 JS 实现:生产纯 HTTP 部署(无 TLS)下 `crypto.subtle` 仅在安全上下文(https/localhost)可用,局域网 IP 恒为 `undefined`,签名/解密会抛错导致请求发不出。签名用 `js-sha256`(`sha256.hmac`,与后端 Node `createHmac` 逐字节一致);后期 AES-GCM 用纯 JS 库(如 `aes-js`)。`crypto.getRandomValues` 不受安全上下文限制,可继续用。

## 六、改动点清单(本期实际范围)

> 只做请求侧签名。大屏受保护接口均为 GET,无请求 body,故不涉及 `cryptKey`、body 解密、响应加密。

### backend

- `config/config.interface.ts`:加 `appSign: { signKey; cryptKey; tsWindow }` 字段(`cryptKey` 保留类型,本期不启用)
- `config.develop.yaml` / `config.prod.yaml`:填 `appSign` 段(`cryptKey` 可填占位,本期不校验)
- `common/app-crypto.ts`(新):HMAC-SHA256 签名、nonce LRU(TTL=300s);AES-GCM 加解密函数可预留但本期不调用
- `common/app-sign.guard.ts`(新):校验 ts/nonce/sign,放行明文响应
- `modules/service-data/service-data.controller.ts`:`screenList()` 加 `@UseGuards(AppSignGuard)`
- `modules/power-history/power-history.controller.ts`:`screenList()` 加 `@UseGuards(AppSignGuard)`
- **不改动**:`TransformInterceptor`(响应明文)、`throttle.guard.ts` 白名单

### web

- `web/.env` / `project.config`:`VITE_APP_SIGN_KEY`(`VITE_APP_CRYPT_KEY` 可留占位)
- `services/app-request.ts`(新):独立 axios 实例,请求拦截器加 `ts+nonce+sign` 三头;响应拦截器**不解密**,直接走 `ResponseItem`
- `services/api/power-history.ts`:`screenList()` 改用 `appRequest`
- `services/api/service-data.ts`:`screenList()` 改用 `appRequest`
- **不改动**:响应解密逻辑(本期明文响应)

## 七、后期(暂缓)待实施清单

- backend `TransformInterceptor`:响应体 AES-GCM 加密分支
- backend `AppSignGuard`:POST/PUT body 解密 + `req.appEncrypted` 打标记
- web `app-request.ts`:响应拦截器解密、POST/PUT 请求 body 加密(**纯 JS 库如 `aes-js`,禁用 `crypto.subtle` — 生产纯 HTTP 不安全上下文下不可用**,见 §2.2/§5.4)
- yaml `cryptKey` 与 `VITE_APP_CRYPT_KEY` 启用
- 待大屏前端真正接入 API 时同步实施,端到端可验证
