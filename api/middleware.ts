import express, { Request, Response, NextFunction } from "express";
import AuthTokenStorageManager, { AuthToken } from "./authTokenStorageManager";

export const createAuthorizationMiddleware = () => {
    return async (req: Request, res: Response, next: NextFunction) => {
        if (req.path.startsWith("/docs")){
            next();
        }

        const authHeader = req.get('Authorization');
        
        if (!authHeader) {
            res.status(403).json({ message: "Access denied. No token provided." });
            return; 
        }
        
        try {
            const authTokens: AuthToken[] = await AuthTokenStorageManager.getTokens();

            const foundToken = authTokens.find((entry) => entry.token === authHeader);

            if (!foundToken) {
                res.status(403).json({ message: "Invalid token." });
                return; 
            }

            const currentDate = new Date();
            const expirationDate = new Date(foundToken.expirationDate);

            if (currentDate > expirationDate) {
                res.status(403).json({ message: "Token has expired." });
                return; 
            }

            next(); 
        } catch (error) {
            console.error("Error reading the auth tokens:", error);
            res.status(500).json({ message: "Internal server error." });
        }
    };
};