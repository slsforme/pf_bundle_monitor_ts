import { spawn } from 'child_process';
import path from 'path';
import { asyncLogger } from './config/appConfig';

const SRC_PATH: string = 'src/';
const API_BASE_PATH: string = 'api/';

async function main(){
    const BASE_PATH = path.join(__dirname, SRC_PATH);

    const PUMPFUN_MODULE_BASE_PATH = path.join(BASE_PATH, 'pumpfun/');
    const BLOCKS_MODULE_BASE_PATH = path.join(BASE_PATH, 'blocks/');
    const ACCOUNTS_MODULE_BASE_PATH = path.join(BASE_PATH, 'accounts/');

    const MODULES: Array<string> = [
        path.join(PUMPFUN_MODULE_BASE_PATH, 'pumpFunMonitor.ts'),
        path.join(PUMPFUN_MODULE_BASE_PATH, 'tokenBuysMonitor.ts'),
        path.join(BLOCKS_MODULE_BASE_PATH, 'blocksMonitor.ts'),
        path.join(ACCOUNTS_MODULE_BASE_PATH, 'accountsMonitor.ts'),
        path.join(API_BASE_PATH, 'schema.ts')
    ];

    const runFile = async (module: string) => {
        const child = spawn('npx', ['ts-node', module], { stdio: 'inherit' });
    
        child.on('error', (err) => {
            asyncLogger.error(`Failed to start subprocess for ${module}: ${err}`);
        });

        child.on('exit', (code) => {
            asyncLogger.warn(`${module} exited with code ${code}`);
        });
    };
    
    MODULES.forEach(runFile);
}

main().catch((error) => {
    asyncLogger.error(`Error occurred in main: ${error}`);
});

/**
 * TODO:
 * + Interfaces & typing
 * + Kafka service 
 * + setup shell script / add redis & kafka to Dockerfile
 * + new log file every hour (keep dir for each day)
 * + TOFIX grpc error with url
 * + limit_req nginx
 */

