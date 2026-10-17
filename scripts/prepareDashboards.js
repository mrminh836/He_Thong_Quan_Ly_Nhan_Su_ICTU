import fs from 'fs';
import path from 'path';

const dashboardsDir = path.resolve('monitoring/grafana/dashboards');

// 1. Process node-exporter-full.json (ID: 1860)
console.log('--- Processing node-exporter-full.json ---');
const nodeFile = path.join(dashboardsDir, 'node-exporter-full.json');
let nodeJson = JSON.parse(fs.readFileSync(nodeFile, 'utf8'));

// Ensure clean provisioning
delete nodeJson.__inputs;
delete nodeJson.__elements;

// Set datasource variable current to Prometheus
if (nodeJson.templating && nodeJson.templating.list) {
  nodeJson.templating.list.forEach(v => {
    if (v.name === 'ds_prometheus') {
      v.current = { text: 'Prometheus', value: 'prometheus', selected: true };
    }
    if (v.name === 'job') {
      v.current = { text: 'node-exporter', value: 'node-exporter', selected: true };
    }
  });
}
fs.writeFileSync(nodeFile, JSON.stringify(nodeJson, null, 2), 'utf8');
console.log('node-exporter-full.json prepared successfully.');

// 2. Process docker-cadvisor.json (ID: 14282)
console.log('--- Processing docker-cadvisor.json ---');
const cadvisorFile = path.join(dashboardsDir, 'docker-cadvisor.json');
let cadvisorRaw = fs.readFileSync(cadvisorFile, 'utf8');

// Replace ${DS_PROMETHEUS} with prometheus
cadvisorRaw = cadvisorRaw.replace(/\$\{DS_PROMETHEUS\}/g, 'prometheus');

let cadvisorJson = JSON.parse(cadvisorRaw);
delete cadvisorJson.__inputs;
delete cadvisorJson.__elements;

// Set default host selection if templating exists
if (cadvisorJson.templating && cadvisorJson.templating.list) {
  cadvisorJson.templating.list.forEach(v => {
    v.datasource = { type: 'prometheus', uid: 'prometheus' };
    if (v.name === 'host') {
      v.current = { text: 'docker-engine:8080', value: 'docker-engine:8080', selected: true };
    }
  });
}

// Ensure panels have explicit datasource
function mapDatasources(panels) {
  panels.forEach(p => {
    if (p.panels) mapDatasources(p.panels);
    if (p.datasource === 'prometheus' || p.datasource === '${DS_PROMETHEUS}') {
      p.datasource = { type: 'prometheus', uid: 'prometheus' };
    }
    if (p.targets) {
      p.targets.forEach(t => {
        if (!t.datasource || t.datasource === 'prometheus' || t.datasource === '${DS_PROMETHEUS}') {
          t.datasource = { type: 'prometheus', uid: 'prometheus' };
        }
      });
    }
  });
}
mapDatasources(cadvisorJson.panels || []);

fs.writeFileSync(cadvisorFile, JSON.stringify(cadvisorJson, null, 2), 'utf8');
console.log('docker-cadvisor.json prepared successfully.');

// 3. Process mysql-overview.json (ID: 7362)
console.log('--- Processing mysql-overview.json ---');
const mysqlFile = path.join(dashboardsDir, 'mysql-overview.json');
let mysqlRaw = fs.readFileSync(mysqlFile, 'utf8');

// Replace ${DS_PROMETHEUS} with prometheus
mysqlRaw = mysqlRaw.replace(/\$\{DS_PROMETHEUS\}/g, 'prometheus');

let mysqlJson = JSON.parse(mysqlRaw);
delete mysqlJson.__inputs;
delete mysqlJson.__elements;

if (mysqlJson.templating && mysqlJson.templating.list) {
  mysqlJson.templating.list.forEach(v => {
    v.datasource = { type: 'prometheus', uid: 'prometheus' };
    if (v.name === 'host') {
      v.current = { text: 'mysql-db:3306', value: 'mysql-db:3306', selected: true };
    }
    if (v.name === 'interval') {
      v.current = { text: '5s', value: '5s', selected: true };
    }
  });
}

mapDatasources(mysqlJson.panels || []);

fs.writeFileSync(mysqlFile, JSON.stringify(mysqlJson, null, 2), 'utf8');
console.log('mysql-overview.json prepared successfully.');

console.log('All 3 dashboards processed and validated.');
