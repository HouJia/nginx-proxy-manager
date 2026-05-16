/**
 * houjia.mycloudnas.com:44 — 简化策略
 * - 仅显式配置：/、/jellyfin/、/subapi、/subw/、/webdav/、/home/
 * - 其余路径原样反代到 QNAP 5001（QNAP 登录后会用 /cgi-bin/、/libs/ 等根路径）
 * 容器内: node /tmp/npm-phase1-final.mjs
 */
import fs from "node:fs";
import { execSync } from "node:child_process";
import proxyHostModel from "/app/models/proxy_host.js";
import internalNginx from "/app/internal/nginx.js";

const H = "192.168.0.6";
const SUBAPI = "https://houjia.mycloudnas.com:44/subapi";
const SUBAPI_SUB = `${SUBAPI}/sub?`;
const now = () => new Date().toISOString().slice(0, 19).replace("T", " ");

const welcomeDir = "/data/nginx/custom/welcome";
fs.mkdirSync(welcomeDir, { recursive: true });
fs.writeFileSync(
	`${welcomeDir}/index.html`,
	`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>houjia.mycloudnas.com</title><style>body{font-family:system-ui,sans-serif;max-width:40rem;margin:2.5rem auto;padding:0 1rem}h1{font-size:1.25rem}a{color:#0b57d0}</style>
</head><body><h1>家庭服务入口</h1><p>请用 <b>https</b> 访问端口 <b>44</b>：</p>
<ul><li><a href="/jellyfin/">Jellyfin</a></li><li><a href="/subapi">Subconverter</a></li>
<li><a href="/subw/">Subweb</a></li>
<li><a href="/cgi-bin/login.html">QNAP 登录</a></li><li><a href="/">QNAP 桌面</a></li>
<li><a href="/webdav/">WebDAV</a></li></ul></body></html>`,
);

const wsHdr = [
	"proxy_set_header Upgrade $http_upgrade;",
	"proxy_set_header Connection $http_connection;",
	"proxy_http_version 1.1;",
].join("\n");

/** 默认：除已声明路径外，URI 原样转到 QNAP HTTPS */
const qnapDefault = [
	`proxy_set_header Host ${H};`,
	wsHdr,
	"proxy_ssl_server_name on;",
	"proxy_ssl_verify off;",
	"proxy_buffering off;",
	"proxy_read_timeout 600;",
	`proxy_pass https://${H}:5001;`,
].join("\n");

const webdavCommon = [
	"client_max_body_size 0;",
	"proxy_request_buffering off;",
	"proxy_ssl_server_name on;",
	"proxy_ssl_verify off;",
	"proxy_read_timeout 3600;",
	"proxy_send_timeout 3600;",
	"proxy_set_header Authorization $http_authorization;",
	"proxy_set_header X-Forwarded-Host $http_host;",
	"proxy_set_header X-Forwarded-Proto $scheme;",
].join("\n");

const locations = [
	{
		path: "/jellyfin/",
		forward_scheme: "http",
		forward_host: H,
		forward_port: 8096,
		forward_path: "/",
		advanced_config: [
			"proxy_set_header X-Forwarded-Host $http_host;",
			"proxy_set_header X-Forwarded-Proto $scheme;",
			"proxy_set_header X-Forwarded-Prefix /jellyfin;",
			`proxy_redirect http://${H}:8096/ /jellyfin/;`,
		].join("\n"),
	},
	{
		path: "/webdav/",
		forward_scheme: "https",
		forward_host: H,
		forward_port: 5008,
		forward_path: "/",
		advanced_config: webdavCommon,
	},
];

const serverAdvanced = [
	"proxy_headers_hash_max_size 1024;",
	"proxy_headers_hash_bucket_size 128;",
	"absolute_redirect off;",
	"port_in_redirect off;",
	"location = /index { return 301 $scheme://$http_host/index/; }",
	"location ^~ /index/ { alias /data/nginx/custom/welcome/; index index.html; }",
	"location = /subc { return 301 $scheme://$http_host/subapi; }",
	// /subapi = 版本；/subapi/sub?、/subapi/version 等 = subconverter 全 API
	[
		"location = /subapi {",
		`proxy_set_header Host ${H}:25500;`,
		`proxy_pass http://${H}:25500/version;`,
		"}",
	].join("\n"),
	[
		"location ^~ /subapi/ {",
		`proxy_set_header Host ${H}:25500;`,
		"rewrite ^/subapi/(.*)$ /$1 break;",
		`proxy_pass http://${H}:25500;`,
		"}",
	].join("\n"),
	"location = /subw { return 301 $scheme://$http_host/subw/; }",
	[
		"location ^~ /subw/ {",
		`proxy_set_header Host ${H}:58081;`,
		"proxy_set_header Accept-Encoding \"\";",
		"proxy_set_header X-Forwarded-Host $http_host;",
		"proxy_set_header X-Forwarded-Proto $scheme;",
		`proxy_pass http://${H}:58081/;`,
		"sub_filter_once off;",
		"sub_filter_types text/html;",
		'sub_filter \'src="/assets/index-DCMRZqjD.js"\' \'src="/assets/index-DCMRZqjD.js?v=subw4"\';',
		"}",
	].join("\n"),
	// subweb 写死根路径；须在 JS 里把 Vue Router base:"/" 改为 base:"/subw/"
	[
		"location ^~ /assets/ {",
		`proxy_set_header Host ${H}:58081;`,
		"proxy_set_header Accept-Encoding \"\";",
		`proxy_pass http://${H}:58081/assets/;`,
		"add_header Cache-Control \"no-store\" always;",
		"sub_filter_once off;",
		"sub_filter_types application/javascript;",
		'sub_filter \'base:"/"\' \'base:"/subw/"\';',
		`sub_filter 'http://houjia.mycloudnas.com:25500/sub?' '${SUBAPI_SUB}';`,
		`sub_filter 'http://${H}:25500/sub?' '${SUBAPI_SUB}';`,
		`sub_filter 'https://houjia.mycloudnas.com:44/subc/sub?' '${SUBAPI_SUB}';`,
		`sub_filter 'http://houjia.mycloudnas.com:25500/' '${SUBAPI}/';`,
		`sub_filter 'http://${H}:25500/' '${SUBAPI}/';`,
		`sub_filter 'https://houjia.mycloudnas.com:44/subc/' '${SUBAPI}/';`,
		'sub_filter \'backendOptions:[{value:"http://127.0.0.1:25500/sub?"}]\' \'backendOptions:[{value:"' +
			SUBAPI_SUB +
			'"},{value:"http://127.0.0.1:25500/sub?"}]\';',
		'sub_filter \'placeholder:"动动小手，（建议）自行搭建后端服务。例：http://127.0.0.1:25500/sub?"\' \'placeholder:"动动小手，（建议）自行搭建后端服务。例：' +
			SUBAPI_SUB +
			'"\';',
		"}",
	].join("\n"),
	[
		"location ^~ /favicons/ {",
		`proxy_set_header Host ${H}:58081;`,
		`proxy_pass http://${H}:58081/favicons/;`,
		"}",
	].join("\n"),
	"location = /qnap { return 301 $scheme://$http_host/cgi-bin/login.html; }",
	"location ^~ /qnap/ { return 301 $scheme://$http_host/cgi-bin/login.html; }",
	"location = /jellyfin { return 301 $scheme://$http_host/jellyfin/; }",
	"location = /webdav { return 301 $scheme://$http_host/webdav/; }",
	[
		"location ^~ /home/ {",
		`proxy_set_header Host ${H}:5008;`,
		webdavCommon,
		`proxy_pass https://${H}:5008/home/;`,
		"}",
	].join("\n"),
	["location / {", qnapDefault, "}"].join("\n"),
].join("\n");

await proxyHostModel.query().patchAndFetchById(1, {
	forward_host: H,
	forward_port: 80,
	forward_scheme: "http",
	advanced_config: serverAdvanced,
	locations,
	trust_forwarded_proto: 1,
	allow_websocket_upgrade: 0,
	block_exploits: 1,
	ssl_forced: 1,
	modified_on: now(),
});

const certDir = "/data/custom_ssl/npm-1";
fs.mkdirSync(certDir, { recursive: true });
fs.writeFileSync(
	`${certDir}/fullchain.pem`,
	fs.readFileSync("/etc/qnap-le/backup.cert", "utf8") + fs.readFileSync("/etc/qnap-le/uca.pem", "utf8"),
);
fs.writeFileSync(`${certDir}/privkey.pem`, fs.readFileSync("/etc/qnap-le/backup.key"));
fs.chmodSync(`${certDir}/privkey.pem`, 0o600);

const hostByPath = {
	"/jellyfin/": H,
	"/webdav/": `${H}:5008`,
};

function patchLocationHost(conf, locPath, host) {
	const esc = locPath.replace(/\//g, "\\/");
	const re = new RegExp(`(location ${esc} \\{[\\s\\S]*?)proxy_set_header Host \\$host;`, "m");
	if (!re.test(conf)) throw new Error(`patch Host failed: ${locPath}`);
	return conf.replace(re, `$1proxy_set_header Host ${host};`);
}

const row = await proxyHostModel
	.query()
	.findById(1)
	.withGraphFetched("[certificate,owner,access_list.[clients,items]]");

const meta = await internalNginx.configure(proxyHostModel, "proxy_host", row);
if (!meta.nginx_online) {
	console.error(meta.nginx_err);
	process.exit(1);
}

let conf = fs.readFileSync("/data/nginx/proxy_host/1.conf", "utf8");
for (const [path, host] of Object.entries(hostByPath)) {
	conf = patchLocationHost(conf, path, host);
}
fs.writeFileSync("/data/nginx/proxy_host/1.conf", conf);

execSync("nginx -t");
execSync("nginx -s reload");
console.log("FINAL OK");
