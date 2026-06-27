/**
 * NAS 家庭反代 — 简化策略（示例内网 IP / 域名请按环境变量覆盖）
 * - 仅显式配置：/、/jellyfin/、/subapi、/subw/、/webdav/、/home/
 * - 其余路径原样反代到 QNAP 5001
 * 容器内: NAS_LAN_IP=192.168.x.x NAS_PUBLIC_HOST=nas.example.com node /tmp/npm-phase1-final.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import proxyHostModel from "/app/models/proxy_host.js";
import internalNginx from "/app/internal/nginx.js";

const H = process.env.NAS_LAN_IP || "192.168.1.100";
const PUBLIC_HOST = process.env.NAS_PUBLIC_HOST || "nas.example.com";
const now = () => new Date().toISOString().slice(0, 19).replace("T", " ");

const welcomeDir = "/data/nginx/custom/welcome";
fs.mkdirSync(welcomeDir, { recursive: true });
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const welcomeTemplate = fs.readFileSync(
	path.join(__dirname, "nas-qnap", "welcome-index.html"),
	"utf8",
);
fs.writeFileSync(
	`${welcomeDir}/index.html`,
	welcomeTemplate.replaceAll("{{LAN_IP}}", H).replaceAll("{{PUBLIC_HOST}}", PUBLIC_HOST),
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
	"location = /subc { return 301 $scheme://$http_host/subapi/version; }",
	// /subapi、/subapi/ → 规范 URL；其余 /subapi/* 反代 subconverter
	"location = /subapi { return 301 $scheme://$http_host/subapi/version; }",
	"location = /subapi/ { return 301 $scheme://$http_host/subapi/version; }",
	[
		"location ^~ /subapi/ {",
		`proxy_set_header Host ${H}:25500;`,
		"proxy_set_header X-Forwarded-Prefix /subapi;",
		"rewrite ^/subapi/(.*)$ /$1 break;",
		`proxy_pass http://${H}:25500;`,
		"}",
	].join("\n"),
	"location = /subw { return 301 $scheme://$http_host/subw/; }",
	// sub-web 以 VITE_BASE_PATH=/subw/ 构建：剥 /subw/ 前缀反代到容器根路径
	[
		"location ^~ /subw/ {",
		`proxy_set_header Host ${H}:58081;`,
		"proxy_set_header X-Forwarded-Host $http_host;",
		"proxy_set_header X-Forwarded-Proto $scheme;",
		"proxy_set_header X-Forwarded-Prefix /subw;",
		`proxy_pass http://${H}:58081/;`,
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
