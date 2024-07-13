// 定义域名数组
let domains = ['cdn.xn--b6gac.eu.org'];
// 定义IPv4和IPv6数组，用于存储解析后的IP地址
let IPv4 = [];
let IPv6 = [];
// 定义API列表
let ipAPI = [];//'https://ipdb.030101.xyz/api/bestproxy.txt'
// 定义DoH（DNS over HTTPS）URL
let dohURL = 'https://cloudflare-dns.com/dns-query';

//Cloudflare DDNS
let CF邮箱 = '';//admin@gmail.com
let CF域名 = '';//ddns.google.com
let CF区域ID = '';//6f0b34f36efb4bdaf5e22d68ac8e5c96
let CFAPI令牌 = '';//tGb4_4f3efb4bdaf5e22d68ac8exRnJTC6-IWocs

let 执行日志 = '';

// 更新IP数组的函数
async function API2ip(APIs) {
	let IP4 = [];
	let IP6 = [];
	if (!APIs || APIs.length === 0) {
		return [IP4, IP6];
	}

	let newIP = "";

	// 创建一个AbortController对象，用于控制fetch请求的取消
	const controller = new AbortController();

	const timeout = setTimeout(() => {
		controller.abort(); // 取消所有请求
	}, 2000); // 2秒后触发

	try {
		// 使用Promise.allSettled等待所有API请求完成，无论成功或失败
		// 对api数组进行遍历，对每个API地址发起fetch请求
		const responses = await Promise.allSettled(APIs.map(apiUrl => fetch(apiUrl, {
			method: 'get', 
			headers: {
				'Accept': 'text/html,application/xhtml+xml,application/xml;',
				'User-Agent': 'cmliu/CF-Workers-DD2D'
			},
			signal: controller.signal // 将AbortController的信号量添加到fetch请求中，以便于需要时可以取消请求
		}).then(response => response.ok ? response.text() : Promise.reject())));

		// 遍历所有响应
		for (const response of responses) {
			// 检查响应状态是否为'fulfilled'，即请求成功完成
			if (response.status === 'fulfilled') {
				// 获取响应的内容
				const content = await response.value;
				newIP += content + '\n';
			}
		}
	} catch (error) {
		console.error(error);
	} finally {
		// 无论成功或失败，最后都清除设置的超时定时器
		clearTimeout(timeout);
	}

	const newIPs = await ADD(newIP);
	// 正则表达式匹配IPv4地址
	const ipv4Regex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

	// 正则表达式匹配IPv6地址
	const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9])?[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9])?[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9])?[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9])?[0-9]))$/;

	newIPs.forEach(ip => {
		if (ipv4Regex.test(ip)) {
				IP4.push(ip);
				log(`API获取 A记录${ip}`);
		} else if (ipv6Regex.test(ip)) {
				IP6.push(ip);
				log(`API获取 AAAA记录${ip}`);
		}
	});

	return [IP4, IP6];
}

// 使用DoH解析域名的函数
async function fetchDNSRecords(domain, type) {
	// 构建查询参数
	const query = new URLSearchParams({
		name: domain,
		type: type
	});
	const url = `${dohURL}?${query.toString()}`;

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
	return data.Answer || [];
}

// 更新IP数组的函数
async function updateIPArrays(domains) {
	let IP4 = [];
	let IP6 = [];
	for (const domain of domains) {
		try {
			// 获取域名的A记录
			const aRecords = await fetchDNSRecords(domain, 'A');
			for (const record of aRecords) {
				if (record.type === 1) { // A记录
					IP4.push(record.data);
					log(`解析域名 ${domain} A记录${record.data}`);
				}
			}
			
			// 获取域名的AAAA记录
			const aaaaRecords = await fetchDNSRecords(domain, 'AAAA');
			for (const record of aaaaRecords) {
				if (record.type === 28) { // AAAA记录
					IP6.push(record.data);
					log(`解析域名 ${domain} AAAA记录${record.data}`);
				}
			}
		} catch (error) {
			console.error(`解析域名 ${domain} 时出错:`, error);
		}
	}
	
	return [IP4, IP6];
}

// 输出结果的函数
async function 输出结果() {
	// 构建IPv6输出字符串
	let IPv6Text = ''
	if (IPv6.length != 0){
		IPv6Text = `IPv6：\n${IPv6.join('\n')}`;
	}


	let APIText = ''
	if (ipAPI.length != 0){
		APIText = `\nIP_API：\n${ipAPI.join('\n')}`;
	}

	const CF配置检查 = CF域名 + CF区域ID + CFAPI令牌 + CF邮箱;
	let CF配置信息
	if (CF配置检查 && CF配置检查 != ''){
		CF配置信息 = `域名：${CF域名}
邮箱：${CF邮箱.substring(0, 1)}******${CF邮箱.substring(CF邮箱.length - 1)}
区域ID：${CF区域ID.substring(0, 3)}*************************${CF区域ID.substring(CF区域ID.length - 4)}
API令牌：${CFAPI令牌.substring(0, 3)}*************************${CFAPI令牌.substring(CFAPI令牌.length - 4)}
		`;
		const 域名现有解析ID_URL = `https://api.cloudflare.com/client/v4/zones/${CF区域ID}/dns_records?name=${CF域名}`;
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
		if (data.success && data.result.length === 0){
			log(`${CF域名} 域名解析为空，跳过删除域名流程`)
		} else {
			for (let record of data.result) {
				域名现有解析ID.push(record.id);
			}
			log(`现有域名ID\n${域名现有解析ID.join('\n')}`);
		}
		// 遍历删除域名
		for (const 解析ID of 域名现有解析ID) {
			await 删除域名(解析ID);
		}

		// 遍历解析域名
		for (const IP of IPv4) {
			await 添加解析('A' , IP);
		}
		for (const IP of IPv6) {
			await 添加解析('AAAA' , IP);
		}

	} else {
		CF配置信息 = 'Cloudflare配置信息错误！'
	}
	// 构建最终的输出文本
	const text = `Domains DDNS to Domain
➖➖➖➖➖➖➖➖➖➖
Cloudflare域名配置信息
➖➖➖➖➖➖➖➖➖➖
${CF配置信息}

➖➖➖➖➖➖➖➖➖➖
配置信息
➖➖➖➖➖➖➖➖➖➖
DOH：
${dohURL}

解析域名：
${domains.join('\n')}${APIText}

➖➖➖➖➖➖➖➖➖➖
整理结果
➖➖➖➖➖➖➖➖➖➖
IPv4：
${IPv4.join('\n')}

${IPv6Text}

➖➖➖➖➖➖➖➖➖➖
执行日志
➖➖➖➖➖➖➖➖➖➖
${执行日志}`;
	
	return text;
}

async function log(text) {
	执行日志 += text + '\n' ;
	console.log(text);
}

// 定义Cloudflare Worker的主处理函数
export default {
	async fetch(request, env, ctx) {
		if (env.DOMAIN) domains = await ADD(env.DOMAIN);
		if (env.IPV4) IPv4 = await ADD(env.IPV4);
		if (env.IPV6) IPv6 = await ADD(env.IPV6);
		if (env.IPAPI) ipAPI = await ADD(env.IPAPI);
		dohURL = env.DOH || dohURL;

		CF邮箱 = env.CFMAIL || CF邮箱;
		CF域名 = env.CFDOMAIN || CF域名;
		CF区域ID = env.CFZONEID || CF区域ID; 
		CFAPI令牌 = env.CFKEY || CFAPI令牌; 
		
		log('变量加载完成');

		// 更新IPv4和IPv6数组
		const d2ip = await updateIPArrays(domains);
		//console.log(d2ip);
		IPv4 = IPv4.concat(d2ip[0]);
		IPv6 = IPv6.concat(d2ip[1]);
		log('域名解析完成');

		const api2ip = await API2ip(ipAPI);
		//console.log(api2ip);
		IPv4 = IPv4.concat(api2ip[0]);
		IPv6 = IPv6.concat(api2ip[1]);
		log('API调用完成');

		// 对数组进行去重
		IPv4 = [...new Set(IPv4)];
		IPv6 = [...new Set(IPv6)];
		log('IP去重完成');

		// 返回输出结果作为响应
		return new Response(await 输出结果());
	},
};

async function 删除域名(域名ID) {
	const 删除域名_URL = `https://api.cloudflare.com/client/v4/zones/${CF区域ID}/dns_records/${域名ID}`;
	try {
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
		if (data.success && data.success == true){
			log(`${CF域名}:${域名ID} 删除成功`)
		} else {
			log(`${CF域名}:${域名ID} 删除失败`)
		}
	} catch (error) {
		log(`${CF域名}:${域名ID} 删除失败`)
	}
}

async function 添加解析(A , IP) {
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
				name: CF域名,
				content: IP,
				ttl: 60,
				proxied: false
			})
		});
		const data = await response.json();
		console.log(JSON.stringify(data, null, 2));
		if (data.success && data.success == true){
			log(`${CF域名} 成功 ${A}记录: ${IP}`)
		} else {
			log(`${CF域名} 失败 ${A}记录: ${IP}`)
		}
	} catch (error) {
		log(`${CF域名} 失败 ${A}记录: ${IP}`)
	}
}

async function ADD(envadd) {
	var addtext = envadd.replace(/[	|"'\r\n]+/g, ',').replace(/,+/g, ','); // 将空格、双引号、单引号和换行符替换为逗号
	if (addtext.charAt(0) == ',') addtext = addtext.slice(1);
	if (addtext.charAt(addtext.length - 1) == ',') addtext = addtext.slice(0, addtext.length - 1);
	const add = addtext.split(',');
	return add;
}
