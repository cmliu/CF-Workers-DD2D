#!/usr/bin/env python3
# 用途: Python脚本，用于更新Cloudflare域名的DNS记录
import json
import time
import os
import socket
from datetime import datetime, timedelta
import asyncio
import aiohttp
from typing import List, Dict, Union, Tuple, Any, Set, Optional

# 常量配置
DOH_URL = 'https://dns.alidns.com/resolve'
DOH_URL2 = 'https://doh.pub/dns-query'
DEFAULT_TIMEOUT = 10.0
WALL_CHECK_TIMEOUT = 8.0
MAX_CONCURRENT_REQUESTS = 4  # 最大并发请求数
REQUEST_INTERVAL = 2  # 请求间隔（秒）

# Cloudflare DDNS默认配置
class CloudflareConfig:
    邮箱: str = ''
    域名: str = ''
    区域ID: str = ''
    API令牌: str = ''

    @classmethod
    def from_env(cls, env: Dict[str, str]) -> 'CloudflareConfig':
        """从环境变量加载配置"""
        config = cls()
        config.邮箱 = env.get('CFMAIL') or config.邮箱
        config.域名 = env.get('CFDOMAIN') or config.域名
        config.区域ID = env.get('CFZONEID') or config.区域ID
        config.API令牌 = env.get('CFKEY') or config.API令牌
        return config

    def is_valid(self) -> bool:
        """检查配置是否完整有效"""
        return bool(self.邮箱 and self.域名 and self.区域ID and self.API令牌)

    def get_auth_headers(self) -> Dict[str, str]:
        """获取认证头信息"""
        return {
            'X-Auth-Email': self.邮箱,
            'Authorization': f"Bearer {self.API令牌}",
            'Content-Type': 'application/json'
        }

执行日志 = ''

def log(text: str) -> None:
    """记录日志函数"""
    global 执行日志
    # 获取当前UTC时间并转换为中国时间 (UTC+8)
    china_time = datetime.utcnow() + timedelta(hours=8)
    formatted_time = china_time.strftime('%Y-%m-%d %H:%M:%S')
    
    log_line = f"{formatted_time} {text}"
    执行日志 += log_line + '\n'
    print(text)

async def fetch_with_timeout(url: str, headers: Optional[Dict[str, str]] = None, timeout: float = DEFAULT_TIMEOUT) -> Dict[str, Any]:
    """发送HTTP请求并设置超时"""
    if headers is None:
        headers = {}
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers, timeout=timeout) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    return {"error": f"HTTP错误 {response.status}"}
    except asyncio.TimeoutError:
        return {"error": f"请求超时 ({timeout}秒): {url}"}
    except Exception as e:
        return {"error": f"请求失败: {str(e)}"}

async def fetch_dns_records(domain: str, record_type: str) -> List[Dict[str, Any]]:
    """使用DoH查询DNS记录，支持多级备用DNS服务"""
    try:
        log(f"尝试使用主要DoH服务解析域名 {domain} 的{record_type}记录...")
        headers = {'Accept': 'application/dns-json'}
        
        # 首先尝试使用主要 DoH 服务
        url = f"{DOH_URL}?name={domain}&type={record_type}"
        log(f"发送DNS查询: {url}")
        
        result = await fetch_with_timeout(url, headers=headers)
        
        if "error" in result or "Answer" not in result or not result["Answer"]:
            log(f"主要DoH服务查询失败，尝试使用备用DoH服务: {domain}")
            # 尝试备用 DoH 服务
            url2 = f"{DOH_URL2}?name={domain}&type={record_type}"
            log(f"发送备用DNS查询: {url2}")
            
            result = await fetch_with_timeout(url2, headers=headers)
            
            if "error" in result or "Answer" not in result or not result["Answer"]:
                log(f"备用DoH服务查询失败，尝试使用本地DNS解析: {domain}")
                # 尝试使用本地DNS解析
                answers = await resolve_with_local_dns(domain, record_type)
                if answers:
                    return answers
                else:
                    log(f"所有DNS查询方式都失败: {domain} ({record_type})")
                    return []
        
        if "Answer" in result and result["Answer"]:
            return result["Answer"]
        else:
            log(f"DNS查询无结果: {domain} ({record_type})")
            return []
            
    except Exception as e:
        log(f"DNS查询发生异常: {domain} - {str(e)}")
        return []

async def resolve_with_local_dns(domain: str, record_type: str) -> List[Dict[str, Any]]:
    """使用本地DNS服务解析域名"""
    try:
        # 使用socket.getaddrinfo进行本地DNS解析
        if record_type == 'A':
            # 在事件循环中运行同步DNS查询
            loop = asyncio.get_event_loop()
            addresses = await loop.run_in_executor(
                None, 
                lambda: socket.getaddrinfo(domain, None, socket.AF_INET)
            )
            
            # 格式化为类似DoH返回的格式
            result = []
            for addr_info in addresses:
                ip = addr_info[4][0]  # 提取IP地址
                result.append({
                    "name": domain,
                    "type": 1,  # A记录
                    "TTL": 60,  # 默认TTL
                    "data": ip
                })
            
            if result:
                log(f"本地DNS解析成功: {domain} - 获取到 {len(result)} 条记录")
                return result
        else:
            log(f"本地DNS解析仅支持A记录，不支持 {record_type} 记录")
        
        return []
    except Exception as e:
        log(f"本地DNS解析失败: {domain} - {str(e)}")
        return []

async def update_ip_arrays(domains: Union[List[str], str]) -> List[str]:
    """解析域名的IP地址列表"""
    ip4: List[str] = []
    resolved_count = 0
    
    # 确保domains是列表
    if not isinstance(domains, list):
        domains = [domains]
    
    for domain in domains:
        try:
            # 确保domain是字符串
            if not isinstance(domain, str):
                log(f"警告: 非字符串域名被跳过: {domain}")
                continue
            
            # 获取域名的A记录
            a_records = await fetch_dns_records(domain, 'A')
            if not a_records:
                log(f"警告：域名 {domain} 未找到A记录")
                continue
            
            for record in a_records:
                if record.get("type") == 1:  # A记录
                    ip4.append(record.get("data"))
                    log(f"解析域名 {domain} A记录{record.get('data')}")
                    resolved_count += 1
        except Exception as e:
            log(f"解析域名 {domain} 时出错: {str(e)}")
    
    if resolved_count == 0 and domains:
        domains_str = ", ".join(domains) if isinstance(domains, list) else str(domains)
        log(f"警告：所有域名({domains_str})解析失败，没有获取到任何IP地址")
    
    return ip4

async def 墙体检测(ips: List[str]) -> List[str]:
    """检查IP是否通过墙体检测"""
    # 去重
    unique_ips: Set[str] = set(ips)
    wall: List[str] = []
    
    if not unique_ips:
        log("无法进行墙体检测：没有提供IP地址")
        return wall
    
    log(f"开始墙体检测，IP数量: {len(unique_ips)}, IP列表: {', '.join(unique_ips)}")
    
    # 使用信号量控制并发请求数
    semaphore = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)
    
    async def check_ip(ip: str) -> Tuple[str, bool]:
        async with semaphore:
            try:
                log(f"正在检测IP: {ip}")
                result = await fetch_with_timeout(
                    f"https://api.24kplus.com/ipcheck?host={ip}&port=22", 
                    timeout=WALL_CHECK_TIMEOUT
                )
                
                if "error" not in result:
                    # 检查返回的json中tcp字段是否为true
                    if result.get("data", {}).get("tcp") is True:
                        log(f"IP {ip} 检测通过")
                        return ip, True
                    else:
                        log(f"IP {ip} 未通过墙体检测，结果: {json.dumps(result)}")
                else:
                    log(f"墙体检测API返回错误: {result['error']}, IP: {ip}")
            except Exception as e:
                log(f"墙体检测失败: {str(e)}, IP: {ip}")
            return ip, False
    
    # 并发检查所有IP
    tasks = [check_ip(ip) for ip in unique_ips]
    results = await asyncio.gather(*tasks)
    
    # 收集通过检测的IP
    wall = [ip for ip, passed in results if passed]
    
    if not wall:
        log(f"警告: 所有IP都未通过墙体检测，可能会导致域名无法解析 (检测的IP: {', '.join(unique_ips)})")
    else:
        log(f"通过检测的IP列表: {', '.join(wall)}")
    
    return wall

def 数组元素是否完全一致(arr1: List[str], arr2: List[str]) -> bool:
    """检查两个数组元素是否完全一致"""
    # 排序并比较
    return sorted(arr1) == sorted(arr2)

async def 待处理域名(serv00编号: str, cf_域名: str) -> Tuple[str, List[str]]:
    """生成需要处理的域名列表"""
    ddns域名 = f"s{serv00编号}.{cf_域名}"
    serv00域名 = [
        f"s{serv00编号}.serv00.com",
        f"web{serv00编号}.serv00.com",
        f"mail{serv00编号}.serv00.com",
    ]
    return ddns域名, serv00域名

def add(envadd: str) -> List[str]:
    """解析环境变量中的服务器编号"""
    import re
    addtext = re.sub(r'[	 |"\'\r\n]+', ',', envadd).replace(',,', ',')
    
    if addtext.startswith(','):
        addtext = addtext[1:]
    if addtext.endswith(','):
        addtext = addtext[:-1]
        
    return addtext.split(',')

async def 执行Cloudflare操作(方法: str, url: str, headers: Dict[str, str], json_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """执行Cloudflare API操作"""
    try:
        async with aiohttp.ClientSession() as session:
            if 方法.upper() == "GET":
                async with session.get(url, headers=headers) as response:
                    return await response.json()
            elif 方法.upper() == "POST":
                async with session.post(url, headers=headers, json=json_data) as response:
                    return await response.json()
            elif 方法.upper() == "DELETE":
                async with session.delete(url, headers=headers) as response:
                    return await response.json()
            else:
                return {"success": False, "errors": [{"message": f"不支持的HTTP方法: {方法}"}]}
    except Exception as e:
        return {"success": False, "errors": [{"message": str(e)}]}

async def 删除域名(域名ID: str, CF配置: CloudflareConfig) -> bool:
    """删除指定ID的DNS记录"""
    删除域名_URL = f"https://api.cloudflare.com/client/v4/zones/{CF配置.区域ID}/dns_records/{域名ID}"
    
    try:
        data = await 执行Cloudflare操作("DELETE", 删除域名_URL, CF配置.get_auth_headers())
        print(json.dumps(data, indent=2))
        
        if not data.get("success"):
            raise Exception(f"删除失败: {json.dumps(data.get('errors', []))}")
        return True
    except Exception as e:
        log(f"删除域名记录失败: {str(e)}")
        return False

async def 批量操作(操作类型: str, 项目列表: List[Any], CF配置: CloudflareConfig, ddns域名: str) -> None:
    """批量执行Cloudflare操作"""
    # 使用信号量控制并发请求
    semaphore = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)
    
    async def 执行操作(项目: Any) -> Any:
        async with semaphore:
            if 操作类型 == "删除":
                域名ID = 项目
                结果 = await 删除域名(域名ID, CF配置)
                if 结果:
                    log(f"{ddns域名}:{域名ID} 删除成功")
                else:
                    log(f"{ddns域名}:{域名ID} 删除失败")
                return 结果
            elif 操作类型 == "添加":
                记录 = 项目
                结果 = await 添加解析(记录["type"], 记录["content"], ddns域名, CF配置)
                return 结果
            return None
    
    # 批量执行操作
    tasks = [执行操作(项目) for 项目 in 项目列表]
    await asyncio.gather(*tasks)

async def 添加解析(A: str, IP: str, ddns域名: str, CF配置: CloudflareConfig) -> bool:
    """添加DNS解析记录"""
    添加解析_URL = f"https://api.cloudflare.com/client/v4/zones/{CF配置.区域ID}/dns_records"
    
    body = {
        "type": A,
        "name": ddns域名,
        "content": IP,
        "ttl": 60,
        "proxied": False
    }
    
    try:
        data = await 执行Cloudflare操作("POST", 添加解析_URL, CF配置.get_auth_headers(), body)
        print(json.dumps(data, indent=2))
        
        if data.get("success"):
            log(f"{ddns域名} 成功 {A}记录: {IP}")
            return True
        else:
            log(f"{ddns域名} 失败 {A}记录: {IP}")
            return False
    except Exception as e:
        log(f"{ddns域名} 失败 {A}记录: {IP} - 错误: {str(e)}")
        return False

async def 生成操作汇总(统计数据: Dict[str, Any]) -> str:
    """生成操作汇总简报"""
    简报 = "\n" + "="*50 + "\n"
    简报 += "【DNS更新操作简报】\n"
    简报 += "="*50 + "\n\n"
    
    简报 += f"总处理服务器数量: {统计数据['总服务器数']}\n"
    简报 += f"处理完成时间: {统计数据['结束时间'].strftime('%Y-%m-%d %H:%M:%S')}\n"
    简报 += f"总耗时: {统计数据['总耗时'].total_seconds():.2f} 秒\n\n"
    
    简报 += "【处理结果统计】\n"
    简报 += f"- 成功更新域名: {统计数据['更新成功数']}\n"
    简报 += f"- 无需更新域名: {统计数据['无需更新数']}\n"
    简报 += f"- 更新失败域名: {统计数据['更新失败数']}\n"
    
    if 统计数据['处理详情']:
        简报 += "\n【处理详情】\n"
        for 服务器编号, 详情 in 统计数据['处理详情'].items():
            简报 += f"- 服务器编号 {服务器编号}: {详情['状态']}\n"
            if '原IP列表' in 详情 and '新IP列表' in 详情:
                简报 += f"  原IP: {', '.join(详情['原IP列表']) if 详情['原IP列表'] else '无'}\n"
                简报 += f"  新IP: {', '.join(详情['新IP列表']) if 详情['新IP列表'] else '无'}\n"
    
    if 统计数据['错误信息']:
        简报 += "\n【错误信息】\n"
        for 错误 in 统计数据['错误信息']:
            简报 += f"- {错误}\n"
    
    简报 += "\n" + "="*50 + "\n"
    return 简报

async def 处理DNS更新(env: Optional[Dict[str, str]] = None) -> str:
    """主要业务逻辑函数"""
    global 执行日志
    执行日志 = ''  # 重置执行日志
    
    # 统计数据初始化
    统计数据 = {
        '开始时间': datetime.utcnow() + timedelta(hours=8),
        '结束时间': None,
        '总耗时': None,
        '总服务器数': 0,
        '更新成功数': 0,
        '无需更新数': 0,
        '更新失败数': 0,
        '处理详情': {},
        '错误信息': []
    }
    
    # 从环境变量获取配置
    if env is None:
        env = {}
    
    # 加载配置
    CF配置 = CloudflareConfig.from_env(env)
    
    serv00s = ['0','1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16']
    if env.get('SERV00') or env.get('serv00'):
        serv00s = add(env.get('SERV00') or env.get('serv00'))
    
    统计数据['总服务器数'] = len(serv00s)
    
    if CF配置.is_valid():
        for serv00编号 in serv00s:
            log(f"开始处理 serv00编号: {serv00编号}")
            统计数据['处理详情'][serv00编号] = {'状态': '处理中'}
            
            try:
                ddns域名, serv00域名 = await 待处理域名(serv00编号, CF配置.域名)
                log(f"处理域名: {ddns域名}, 服务域名列表: {', '.join(serv00域名)}")
                
                # 确保当前ddns域名解析IP传入数组
                当前ddns域名解析IP = list(set(await update_ip_arrays([f"{ddns域名}.cdn.cloudflare.net"])))
                log(f"当前ddns域名解析IP: {', '.join(当前ddns域名解析IP)}")
                统计数据['处理详情'][serv00编号]['原IP列表'] = 当前ddns域名解析IP
                
                当前serv00域名解析IP = []
                解析失败计数 = 0
                
                for domain in serv00域名:
                    ips = await update_ip_arrays([domain])
                    if not ips:
                        解析失败计数 += 1
                    当前serv00域名解析IP.extend(ips)
                
                if 解析失败计数 == len(serv00域名):
                    log(f"严重警告：serv00编号 {serv00编号} 的所有服务域名都无法解析，请检查域名是否存在")
                    统计数据['处理详情'][serv00编号]['状态'] = '服务域名解析失败'
                    统计数据['更新失败数'] += 1
                    统计数据['错误信息'].append(f"服务器 {serv00编号}: 所有服务域名无法解析")
                    continue
                
                log(f"当前serv00域名解析IP: {', '.join(当前serv00域名解析IP)}")
                
                准备ddns域名解析IP = await 墙体检测(当前serv00域名解析IP)
                log(f"serv00编号 {serv00编号} 的准备域名解析IP: {', '.join(准备ddns域名解析IP)}")
                统计数据['处理详情'][serv00编号]['新IP列表'] = 准备ddns域名解析IP
                
                if 准备ddns域名解析IP:
                    是否一致 = 数组元素是否完全一致(当前ddns域名解析IP, 准备ddns域名解析IP)
                    if 是否一致:
                        log("域名解析IP一致，无需更新")
                        统计数据['处理详情'][serv00编号]['状态'] = 'IP一致，无需更新'
                        统计数据['无需更新数'] += 1
                    else:
                        log("域名解析IP不一致，准备更新")
                        
                        # 获取现有DNS记录
                        域名现有解析ID_URL = f"https://api.cloudflare.com/client/v4/zones/{CF配置.区域ID}/dns_records?name={ddns域名}"
                        
                        data = await 执行Cloudflare操作("GET", 域名现有解析ID_URL, CF配置.get_auth_headers())
                        print(json.dumps(data, indent=2))
                        域名现有解析ID = []
                        
                        if not data.get("success") or not data.get("result"):
                            log(f"{ddns域名} 域名解析为空，跳过删除域名流程")
                        else:
                            for record in data.get("result", []):
                                域名现有解析ID.append(record.get("id"))
                            log(f"现有域名ID\n{chr(10).join(域名现有解析ID)}")
                        
                        # 删除现有记录
                        await 批量操作("删除", 域名现有解析ID, CF配置, ddns域名)
                        
                        # 添加新记录
                        解析记录列表 = [{"type": "A", "content": ip} for ip in 准备ddns域名解析IP]
                        await 批量操作("添加", 解析记录列表, CF配置, ddns域名)
                        
                        统计数据['处理详情'][serv00编号]['状态'] = '更新成功'
                        统计数据['更新成功数'] += 1
                else:
                    log(f"serv00编号 {serv00编号} 的墙体检测未通过任何IP，跳过更新")
                    统计数据['处理详情'][serv00编号]['状态'] = '墙体检测未通过'
                    统计数据['更新失败数'] += 1
                    统计数据['错误信息'].append(f"服务器 {serv00编号}: 墙体检测未通过任何IP")
            except Exception as e:
                log(f"处理 serv00编号: {serv00编号} 时发生错误: {str(e)}")
                统计数据['处理详情'][serv00编号]['状态'] = f'处理出错: {str(e)}'
                统计数据['更新失败数'] += 1
                统计数据['错误信息'].append(f"服务器 {serv00编号}: {str(e)}")
            
            log(f"结束处理 serv00编号: {serv00编号}")
        
        # 计算总耗时并生成简报
        统计数据['结束时间'] = datetime.utcnow() + timedelta(hours=8)
        统计数据['总耗时'] = 统计数据['结束时间'] - 统计数据['开始时间']
        
        简报 = await 生成操作汇总(统计数据)
        log(简报)  # 使用log函数添加到执行日志中，不单独打印
        
        return 执行日志
    else:
        log("Cloudflare配置不完整，请检查环境变量或默认值")
        return "Cloudflare配置不完整"

async def main():
    """主函数"""
    # 从环境变量获取配置
    env = {
        'CFMAIL': os.environ.get('CFMAIL'),
        'CFDOMAIN': os.environ.get('CFDOMAIN'),
        'CFZONEID': os.environ.get('CFZONEID'),
        'CFKEY': os.environ.get('CFKEY'),
        'SERV00': os.environ.get('SERV00')
    }
    
    log(f"开始执行 - {datetime.utcnow().isoformat()}")
    result = await 处理DNS更新(env)
    
    # 不要再次打印完整日志，因为处理过程中已经通过log函数输出了所有内容
    # print(result)

if __name__ == "__main__":
    asyncio.run(main())
