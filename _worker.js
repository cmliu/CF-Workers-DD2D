// 用途: Cloudflare Workers脚本，用于更新Cloudflare域名的DNS记录
// 定义DoH（DNS over HTTPS）URL
let dohURL = 'https://cloudflare-dns.com/dns-query';
//Cloudflare DDNS
let CF邮箱 = '';//admin@gmail.com
let CF域名 = '';//ddns.google.com
let CF区域ID = '';//6f0b34f36efb4bdaf5e22d68ac8e5c96
let CFAPI令牌 = '';//tGb4_4f3efb4bdaf5e22d68ac8exRnJTC6-IWocs

let 执行日志 = '';

export default {
    // 处理HTTP请求
    async fetch(request, env, ctx) {
        const token = env.TOKEN || 'auto';
        const { pathname } = new URL(request.url);
        if (pathname === `/${token}`) {
            return await 处理DNS更新(env);
        } else return new Response('Hello World!');
    },
    
    // 处理定时任务触发
    async scheduled(controller, env, ctx) {
        log(`定时任务触发 - ${new Date().toISOString()}`);
        await 处理DNS更新(env);
        // 定时任务不需要返回Response，如果需要记录日志可以使用ctx.waitUntil()
        ctx.waitUntil(console.log(执行日志));
    }
};

// 提取的业务逻辑函数
async function 处理DNS更新(env) {
    执行日志 = ''; // 重置执行日志
    
    let serv00s = ['0','1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16'];
    if(env.SERV00 || env.serv00) serv00s = await ADD(env.SERV00 || env.serv00);

    CF邮箱 = env.CFMAIL || CF邮箱;
    CF域名 = env.CFDOMAIN || CF域名;
    CF区域ID = env.CFZONEID || CF区域ID; 
    CFAPI令牌 = env.CFKEY || CFAPI令牌; 

    const CF配置检查 = CF域名 + CF区域ID + CFAPI令牌 + CF邮箱;
    if (CF配置检查 && CF配置检查 != ''){
        for (const serv00编号 of serv00s) {
            log(`开始处理 serv00编号: ${serv00编号}`);
            
            try {
                const [ddns域名, serv00域名] = await 待处理域名(serv00编号, CF域名);
                log(`处理域名: ${ddns域名}, 服务域名列表: ${Array.isArray(serv00域名) ? serv00域名.join(", ") : String(serv00域名)}`);
                
                // 确保当前ddns域名解析IP传入数组
                const 当前ddns域名解析IP = [...new Set(await updateIPArrays([`${ddns域名}.cdn.cloudflare.net`]))];
                log(`当前ddns域名解析IP: ${当前ddns域名解析IP.join(", ")}`);

                const 当前serv00域名解析IP = [];
                let 解析失败计数 = 0;
                
                for (const domain of serv00域名) {
                    const ips = await updateIPArrays([domain]);
                    if (ips.length === 0) {
                        解析失败计数++;
                    }
                    当前serv00域名解析IP.push(...ips);
                }
                
                if (解析失败计数 === serv00域名.length) {
                    log(`严重警告：serv00编号 ${serv00编号} 的所有服务域名都无法解析，请检查域名是否存在`);
                }
                
                log(`当前serv00域名解析IP: ${当前serv00域名解析IP.join(", ")}`);

                const 准备ddns域名解析IP = await 墙体检测(当前serv00域名解析IP);
                log(`serv00编号 ${serv00编号} 的准备域名解析IP: ${准备ddns域名解析IP.join(", ")}`);

                if (准备ddns域名解析IP.length !== 0) {
                    const 是否一致 = 数组元素是否完全一致(当前ddns域名解析IP, 准备ddns域名解析IP);
                    if (是否一致) {
                        log(`域名解析IP一致，无需更新`);
                    } else {
                        log(`域名解析IP不一致，准备更新`);
                        const 域名现有解析ID_URL = `https://api.cloudflare.com/client/v4/zones/${CF区域ID}/dns_records?name=${ddns域名}`;
                        const response = await fetch(域名现有解析ID_URL, {
                            method: 'GET',
                            headers: {
                                'X-Auth-Email': CF邮箱,
                                'Authorization': `Bearer ${CFAPI令牌}`,
                                'Content-Type': 'application/json'
                            }
                        });
                        const data = await response.json();
                        console.log(JSON.stringify(data, null, 2));
                        let 域名现有解析ID = [];
                        if (!data.success || data.result.length === 0) {
                            log(`${ddns域名} 域名解析为空，跳过删除域名流程`)
                        } else {
                            for (let record of data.result) {
                                域名现有解析ID.push(record.id);
                            }
                            log(`现有域名ID\n${域名现有解析ID.join('\n')}`);
                        }

                        await 批量删除域名(域名现有解析ID, ddns域名);


                        const 解析记录列表 = [...准备ddns域名解析IP.map(ip => ({ type: 'A', content: ip }))];
                        await 批量添加解析(解析记录列表, ddns域名);
                    }
                } else {
                    log(`serv00编号 ${serv00编号} 的墙体检测未通过任何IP，跳过更新`);
                }
            } catch (error) {
                log(`处理 serv00编号: ${serv00编号} 时发生错误: ${error.message}`);
            }
            
            log(`结束处理 serv00编号: ${serv00编号}`);
        }
        return new Response(执行日志);
    } else return new Response('Cloudflare配置不完整');
}

async function 批量添加解析(解析记录列表, ddns域名) {
    const 批次大小 = 4; // 每批并发请求的数量
    const 批次间隔 = 2000; // 批次之间的间隔时间（毫秒）

    for (let i = 0; i < 解析记录列表.length; i += 批次大小) {
        const 当前批次 = 解析记录列表.slice(i, i + 批次大小);

        // 并发发送当前批次的请求
        await Promise.all(当前批次.map(记录 => 添加解析(记录.type, 记录.content, ddns域名)));

        // 如果还有下一批，则等待指定的间隔时间
        if (i + 批次大小 < 解析记录列表.length) {
            await new Promise(resolve => setTimeout(resolve, 批次间隔));
        }
    }
}

// 修改添加解析函数，返回一个 Promise
async function 添加解析(A, IP, ddns域名) {
    const 添加解析_URL = `https://api.cloudflare.com/client/v4/zones/${CF区域ID}/dns_records`;
    try {
        const response = await fetch(添加解析_URL, {
            method: 'POST',
            headers: {
                'X-Auth-Email': CF邮箱,
                'Authorization': `Bearer ${CFAPI令牌}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                type: A,
                name: ddns域名,
                content: IP,
                ttl: 60,
                proxied: false
            })
        });
        const data = await response.json();
        console.log(JSON.stringify(data, null, 2));
        if (data.success) {

            //tgmsg += `\n${A}记录: ${IP}`
            log(`${ddns域名} 成功 ${A}记录: ${IP}`);
        } else {

            //tgmsg += `\n失败: ${IP}`
            log(`${ddns域名} 失败 ${A}记录: ${IP}`);
        }
    } catch (error) {

        //tgmsg += `\n失败: ${IP}`
        log(`${ddns域名} 失败 ${A}记录: ${IP}`);
    }
}

async function 批量删除域名(域名ID数组, ddns域名) {
    const 批次大小 = 4; // 每批并发请求的数量
    const 批次间隔 = 2000; // 批次之间的间隔时间（毫秒）

    for (let i = 0; i < 域名ID数组.length; i += 批次大小) {
        const 当前批次 = 域名ID数组.slice(i, i + 批次大小);

        // 并发删除当前批次的域名
        const 删除promises = 当前批次.map(域名ID => 删除域名(域名ID));
        const results = await Promise.allSettled(删除promises);

        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                log(`${ddns域名}:${当前批次[index]} 删除成功`);
            } else {
                log(`${ddns域名}:${当前批次[index]} 删除失败: ${result.reason}`);
            }
        });

        // 如果还有下一批，则等待指定的间隔时间
        if (i + 批次大小 < 域名ID数组.length) {
            await new Promise(resolve => setTimeout(resolve, 批次间隔));
        }
    }
}

async function 删除域名(域名ID) {
    const 删除域名_URL = `https://api.cloudflare.com/client/v4/zones/${CF区域ID}/dns_records/${域名ID}`;
    const response = await fetch(删除域名_URL, {
        method: 'DELETE',
        headers: {
            'X-Auth-Email': CF邮箱,
            'Authorization': `Bearer ${CFAPI令牌}`,
            'Content-Type': 'application/json'
        }
    });
    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
    if (!data.success) {
        throw new Error(`删除失败: ${JSON.stringify(data.errors)}`);
    }
}

function 数组元素是否完全一致(arr1, arr2) {
    // 先对数组进行排序，然后转为字符串比较
    const sortedArr1 = [...arr1].sort();
    const sortedArr2 = [...arr2].sort();

    // 如果长度不同，则肯定不完全一致
    if (sortedArr1.length !== sortedArr2.length) {
        return false;
    }

    // 比较每个元素是否相同
    for (let i = 0; i < sortedArr1.length; i++) {
        if (sortedArr1[i] !== sortedArr2[i]) {
            return false;
        }
    }

    return true;
}

async function 待处理域名(serv00编号, CF域名) {
    const ddns域名 = `s${serv00编号}.${CF域名}`;
    const serv00域名 = [
        `s${serv00编号}.serv00.com`,
        `web${serv00编号}.serv00.com`,
        `mail${serv00编号}.serv00.com`,
    ];
    return [ddns域名, serv00域名]; // 确保返回格式正确: [字符串, 数组]
}

async function ADD(envadd) {
    var addtext = envadd.replace(/[	 |"'\r\n]+/g, ',').replace(/,+/g, ','); // 将空格、双引号、单引号和换行符替换为逗号
    if (addtext.charAt(0) == ',') addtext = addtext.slice(1);
    if (addtext.charAt(addtext.length - 1) == ',') addtext = addtext.slice(0, addtext.length - 1);
    const add = addtext.split(',');
    return add;
}

async function updateIPArrays(domains) {
    let IP4 = [];
    let resolvedCount = 0; // 添加计数器记录成功解析的域名数
    
    // 确保domains是数组
    if (!Array.isArray(domains)) {
        domains = [domains];
    }
    
    for (const domain of domains) {
        try {
            // 确保domain是字符串
            if (typeof domain !== 'string') {
                log(`警告: 非字符串域名被跳过: ${domain}`);
                continue;
            }
            
            // 获取域名的A记录
            log(`尝试解析域名 ${domain} 的A记录...`);
            const aRecords = await fetchDNSRecords(domain, 'A');
            if (aRecords.length === 0) {
                log(`警告：域名 ${domain} 未找到A记录`);
                continue;
            }
            
            for (const record of aRecords) {
                if (record.type === 1) { // A记录
                    IP4.push(record.data);
                    log(`解析域名 ${domain} A记录${record.data}`);
                    resolvedCount++;
                }
            }
        } catch (error) {
            log(`解析域名 ${domain} 时出错: ${error.message}`);
        }
    }

    if (resolvedCount === 0 && domains.length > 0) {
        // 使用安全的方式获取域名列表字符串
        const domainsStr = Array.isArray(domains) ? domains.join(', ') : String(domains);
        log(`警告：所有域名(${domainsStr})解析失败，没有获取到任何IP地址`);
    }

    return IP4;
}

// 使用DoH解析域名的函数
async function fetchDNSRecords(domain, type) {
    // 构建查询参数
    const query = new URLSearchParams({
        name: domain,
        type: type
    });
    const url = `${dohURL}?${query.toString()}`;
    log(`发送DNS查询: ${url}`);

    try {
        // 发送HTTP GET请求
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/dns-json' // 接受DNS JSON格式的响应
            }
        });

        // 检查响应是否成功
        if (!response.ok) {
            throw new Error(`获取DNS记录失败: ${response.statusText}`);
        }

        // 解析响应数据
        const data = await response.json();
        if (!data.Answer || data.Answer.length === 0) {
            log(`DNS查询无结果: ${domain} (${type})`);
            return [];
        }
        return data.Answer || [];
    } catch (error) {
        log(`DNS查询失败: ${domain} - ${error.message}`);
        throw error;
    }
}

async function 墙体检测(IPs) {
    IPs = [...new Set(IPs)];
    let wall = [];
    
    if (IPs.length === 0) {
        log(`无法进行墙体检测：没有提供IP地址`);
        return wall;
    }
    
    log(`开始墙体检测，IP数量: ${IPs.length}, IP列表: ${IPs.join(", ")}`);
    
    for (const ip of IPs) {
        try {
            // 设置更合理的超时时间，考虑到墙体检测可能需要更长时间
            log(`正在检测IP: ${ip}`);
            const response = await fetchWithTimeout(`https://api.24kplus.com/ipcheck?host=${ip}&port=22`, {}, 8000);

            if (response.ok) {
                const json = await response.json();
                // 检查返回的json中tcp字段是否为true
                if (json.data && json.data.tcp === true) {
                    wall.push(ip);
                    log(`IP ${ip} 检测通过`);
                } else {
                    log(`IP ${ip} 未通过墙体检测，结果: ${JSON.stringify(json)}`);
                }
            } else {
                log(`墙体检测API返回错误，状态码: ${response.status}, IP: ${ip}`);
            }
        } catch (error) {
            log(`墙体检测失败: ${error.message}, IP: ${ip}`);
            // 如果API失败，可以考虑默认通过或使用备选API
            // wall.push(ip); // 取消注释如果希望API失败时默认通过检测
        }
    }

    if (wall.length === 0) {
        log(`警告: 所有IP都未通过墙体检测，可能会导致域名无法解析 (检测的IP: ${IPs.join(', ')})`);
        // 可以考虑添加通知机制，如发送邮件或其他警报
    } else {
        log(`通过检测的IP列表: ${wall.join(', ')}`);
    }

    return wall;
}

// 更新fetchWithTimeout函数以提供更清晰的错误信息
async function fetchWithTimeout(url, options, timeout = 10000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error(`请求超时 (${timeout}ms): ${url}`);
        }
        throw error;
    }
}

async function log(text) {
    // 获取当前的 UTC 时间
    const now = new Date();

    // 将 UTC 时间转换为中国时间 (CST, UTC+8)
    const offset = 8 * 60 * 60 * 1000; // 8 小时的毫秒数
    const chinaTime = new Date(now.getTime() + offset);

    function formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');

        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    // 格式化为 yyyy-MM-dd HH:mm:ss
    const formattedTime = formatDate(chinaTime);
    执行日志 += formattedTime + ' ' + text + '\n';
    console.log(text);
}