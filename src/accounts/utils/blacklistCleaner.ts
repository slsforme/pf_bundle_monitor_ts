import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { asyncLogger } from '../../../config/appConfig'; // Используем ваш существующий логгер

const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);

const FILE_PATH = path.join(__dirname, '../../data/blacklist-wallets.json');
const CHECK_INTERVAL = 60000; // Проверка каждую минуту (в миллисекундах)

/**
 * Исправляет JSON файл, удаляя лишний символ ']' в конце
 */
async function fixJsonFile(): Promise<void> {
    asyncLogger.info("HI")
  try {
    // Чтение файла как текст
    const fileContent = await readFileAsync(FILE_PATH, 'utf8');
    
    try {
      // Попытка разбора JSON
      JSON.parse(fileContent);
      // Если JSON валиден, ничего не делаем
      return;
    } catch (parseError) {
      // Если ошибка разбора, проверяем, нужно ли исправить файл
      
      // Ищем лишнюю закрывающую скобку в конце
      const trimmedContent = fileContent.trim();
      
      if (trimmedContent.endsWith(']]')) {
        // Если файл заканчивается на ']]', удаляем один ']'
        const fixedContent = trimmedContent.slice(0, -1);
        
        try {
          // Проверяем, что исправленный JSON валиден
          JSON.parse(fixedContent);
          
          // Записываем исправленный JSON обратно в файл
          await writeFileAsync(FILE_PATH, fixedContent, 'utf8');
          asyncLogger.info(`Fixed JSON file by removing extra ']' at the end: ${FILE_PATH}`);
        } catch (secondParseError) {
          // Если JSON все еще невалиден после исправления
          asyncLogger.error(`Failed to fix JSON file. The issue might be more complex: ${secondParseError.message}`);
        }
      } else {
        // Более сложная логика для поиска и исправления других проблем
        let fixedContent = fileContent;
        
        // Проверка на лишний разделитель запятой перед закрывающей скобкой
        fixedContent = fixedContent.replace(/,(\s*[\]}])/g, '$1');
        
        // Удаление невидимых символов, которые могут вызывать проблемы
        fixedContent = fixedContent.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
        
        try {
          // Проверяем, что исправленный JSON валиден
          JSON.parse(fixedContent);
          
          // Записываем исправленный JSON обратно в файл
          await writeFileAsync(FILE_PATH, fixedContent, 'utf8');
          asyncLogger.info(`Fixed JSON file with complex corrections: ${FILE_PATH}`);
        } catch (complexParseError) {
          asyncLogger.error(`Failed to fix JSON with complex corrections: ${complexParseError.message}`);
          
          // Последняя попытка: попробуем найти валидный JSON внутри файла
          const possibleJson = findValidJsonSubstring(fileContent);
          if (possibleJson) {
            await writeFileAsync(FILE_PATH, possibleJson, 'utf8');
            asyncLogger.info(`Fixed JSON file by extracting valid JSON: ${FILE_PATH}`);
          } else {
            asyncLogger.error('Could not find valid JSON in the file.');
          }
        }
      }
    }
  } catch (fileError) {
    asyncLogger.error(`Error accessing JSON file: ${fileError.message}`);
  }
}

/**
 * Пытается найти валидный JSON в строке, начиная с начала
 */
function findValidJsonSubstring(content: string): string | null {
  // Проверяем, является ли контент массивом
  if (content.trim().startsWith('[')) {
    let depth = 0;
    let inString = false;
    let escape = false;
    
    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      
      if (escape) {
        escape = false;
        continue;
      }
      
      if (inString) {
        if (char === '\\') {
          escape = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }
      
      if (char === '"') {
        inString = true;
      } else if (char === '[') {
        depth++;
      } else if (char === ']') {
        depth--;
        
        // Если мы нашли закрывающую скобку для основного массива
        if (depth === 0) {
          const substring = content.substring(0, i + 1);
          try {
            // Проверяем, что полученный JSON валиден
            JSON.parse(substring);
            return substring;
          } catch (e) {
            // Если невалиден, продолжаем поиск
          }
        }
      }
    }
  }
  
  return null;
}

/**
 * Запускает периодическую проверку JSON файла
 */
async function startJsonFileMonitoring(): Promise<void> {
  asyncLogger.info(`Starting JSON file monitoring for ${FILE_PATH}, interval: ${CHECK_INTERVAL}ms`);
  
  // Немедленная проверка при запуске
  fixJsonFile();
  
  setInterval(fixJsonFile, CHECK_INTERVAL);
}


export { fixJsonFile, startJsonFileMonitoring };