# CF-Workers-DD2D
将多个域名IP解析至指定域名的worker.js脚本


## 变量说明
| 变量名 | 示例 | 必填 | 备注 |
|--------|---------|-|-----|
| CFMAIL  | `admin@gmail.com` |√| Cloudflare 登录邮箱 |
| CFDOMAIN  | `ddns.google.com` |√| Cloudflare 待解析域名 |
| CFZONEID   | `6f0b34f36efb4bdaf5e22d68ac8e5c96` |√| Cloudflare 区域ID | 
| CFKEY  | `tGb4_4f5e23efb4d68ac28exRnJTfbdaC6-IWocs` |√| Cloudflare API令牌 |
| DOH | `https://cloudflare-dns.com/dns-query` |×| DoH（DNS over HTTPS）URL |
| DOMAIN | `cdn.xn--b6gac.eu.org` |×| 获取待解析至`待解析域名`IP的域名(支持多元素之间`,`或 换行 作间隔) |
| IPV4 | `8.8.8.8` |×| 待解析至`待解析域名`IPv4(支持多元素之间`,`或 换行 作间隔) |
| IPV6 | `2406:8dc0:6004:7019:ca7a:65a0:d3d7:1467` |×| 待解析至`待解析域名`IPv6(支持多元素之间`,`或 换行 作间隔) |
| IPAPI | `https://ipdb.030101.xyz/api/bestproxy.txt` |×| 通过API获取待解析至`待解析域名`IP的接口(支持多元素之间`,`或 换行 作间隔) |
| TGTOKEN | `6894123456:XXXXXXXXXX0qExVsBPUhHDAbXXX` |×| 发送TG通知的机器人token | 
| TGID | `6946912345` |×| 接收TG通知的账户数字ID | 
