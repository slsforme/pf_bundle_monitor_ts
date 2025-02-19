import { logger } from "../../../config/appConfig";

export default function initializeLocalLogger(fileName: string){
    return logger.child({ requestId: fileName });
}

