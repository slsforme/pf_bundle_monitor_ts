import * as TOML from "@iarna/toml";
import { readFileSync } from "fs";
import { join } from "path";

const tomlPath = join(__dirname, "config.toml");
const tomlString = readFileSync(tomlPath, "utf-8");
const config = TOML.parse(tomlString) as any;

export const tokenParserUri: string = config.source?.token_parser_uri || "";
export const tokenParserUrl: string = config.source?.token_parser_url || "";
export const rpcUri: string = config.source?.rpc_uri || "";
export const rpcUrl: string = config.source?.rpc_url || "";
export const grpcUrl: string = config.source?.grpc_url || "";
export const backupRpcUri: string = config.source?.backup_rpc_uri || "";
export const backupRpcUrl: string = config.source?.backup_rpc_url || "";
export const backupGrpcUrl: string = config.source?.backup_grpc_url || "";

export const cacheExpirationMin: number = config.numbers?.cache_expiration_min || 0;
export const raydiumCacheExpitationMin: number = config.numbers?.raydium_cache_expitation_min || 0;

export const pumpProgram: string = config.pumpfun?.pump_program || "";
export const raydiumProgram: string = config.pumpfun?.raydiumProgram || "";

