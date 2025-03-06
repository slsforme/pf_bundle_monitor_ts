import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
import YAML from 'yaml';

import { CheckerRequestBody, CheckerResponse } from "./types";
import { BlacklistHandler } from "../src/accounts/accountsMonitor";
import { createAuthorizationMiddleware } from "./middleware";
import helmet from "helmet";
import { asyncLogger } from "../config/appConfig";

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const PORT = parseInt(process.env.PORT) || 3000;
const DEFAULT_API_PATH: string = "/api/v1/";

const file = fs.readFileSync(path.resolve(__dirname, './openapi.yaml'), 'utf8');
const swaggerDocument = YAML.parse(file);

app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST'], 
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false, 
  }));
app.use(helmet());
app.use(express.json());

app.use('/docs', swaggerUi.serve);
app.get('/docs', swaggerUi.setup(swaggerDocument));

app.get(DEFAULT_API_PATH, createAuthorizationMiddleware(), (req: Request, res: Response) => {
    res.json({ message: "Welcome to the FILTRED API." });
});

app.post(DEFAULT_API_PATH + 'check/', createAuthorizationMiddleware(), async (req: Request<{}, {}, CheckerRequestBody>, res: Response<CheckerResponse>) => {
    try { 
        const body: CheckerRequestBody = req.body;
        const mintAddress: string = body.mintAddress;
    
        const result = await BlacklistHandler.doesTokenHasRuggers(mintAddress);
        if (result) {
            res.status(200).json({ message: `Blacklisted holders.` });
        } else {
            res.status(200).json({ message: `Blacklisted wallets not found.` });
        }
    } catch (error) {
        res.status(500).json({ message: "An error occurred while checking the blacklist." });
        asyncLogger.error(error);
    }
});

app.listen(PORT, '0.0.0.0' , () => console.log(`Server currently running on port ${PORT}. OpenAPI docs available at http://localhost:${PORT}/docs`));