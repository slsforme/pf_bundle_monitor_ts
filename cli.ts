import { select, input, confirm } from '@inquirer/prompts';
import figlet from 'figlet';
import dotenv from 'dotenv';
import fs from 'fs';
import { join } from 'path';
import { bold, underline } from "colorette";

import AuthTokenManager from './api/authTokenManager';
import AuthTokenStorageManager, { AuthToken } from './api/authTokenStorageManager';

dotenv.config();

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }


function exit(){
  console.log(bold('- Bye!'));
  process.exit(0);
}


async function getBackToMainMenu(){
  const toContinue = await confirm({ message: 'Go back to the main menu?' });
  if (toContinue){
    console.clear();
    await cli();
  } else {
    exit();
  }
}

async function getBackToAdminPanel(discordId: string){
  const toContinue = await confirm({ message: 'Go back to the Admin Panel?' });
  if (toContinue){
    console.clear();
    await cliAdminPanel(discordId);
  } else {
    exit();
  }
}

async function cliAdminPanel(discordId: string){
  const doesTokenExists: boolean = await AuthTokenStorageManager.doesTokenExists(discordId);
  if (doesTokenExists){
    const answer = await select({
      message: `Select an option. Currently you working with User: ${bold(underline(discordId))}`,
      choices: [
        {
          name: 'Switch user',
          value: 'switch-user',
          description: "Moves you to Personal Cabinet for another user. Before moving on you should write down user's Discord ID.",
        },   
        {
          name: 'Delete Auth Token',
          value: 'delete-auth',
          description: 'Removes Token from system.',
        },
        {
          name: 'Add days to Token',
          value: 'add-days-auth',
          description: 'Moves you to panel for adding days to specific user.',
        },
        {
          name: 'Remove days from Token',
          value: 'remove-days-auth',
          description: 'Moves you to panel for removing days from specific user.',
        },   
        {
          name: 'Show all existing Tokens',
          value: 'show-all-tokens',
          description: 'Printing all existing tokens with Discord ID & Expiration date.',
        },    
        {
          name: 'Get back to Main Menu',
          value: 'main-menu',
          description: "Moves you to Main Menu.",
        },    
        {
          name: 'Exit',
          value: 'exit',
          description: "Exit from CLI.",
        },    
      ],
    });
  
    switch (answer){
      case 'delete-auth':
        const toDelete = await confirm({ message: 'You sure you want to delete this token?' });
        if (toDelete){
            AuthTokenStorageManager.removeToken(discordId);
            console.log(bold("Token was deleted successfully!"));
            await getBackToMainMenu();
        } else {
          console.log(bold("Token was left unchanged."));
          await getBackToAdminPanel(discordId);
        }
      
      case 'add-days-auth':
        try{
          const token: AuthToken = await AuthTokenStorageManager.getToken(discordId);
          const expirationDate = new Date(new Date(token.expirationDate).getTime());
          const daysToAdd = parseInt(await input({ message: 'Enter amount of days you want to remove'}));
          expirationDate.setDate(expirationDate.getDate() + daysToAdd);
          await AuthTokenStorageManager.updateToken(discordId, expirationDate);
          await getBackToAdminPanel(discordId);
        } catch (error){
          if (error instanceof SyntaxError){
            console.log("Amount of days was typed incorrectly. Try again.");
          } else {
            console.log(`Error occurred while adding days:`, error);
          }
        } 
  
      case 'remove-days-auth':
        try{
          const token: AuthToken = await AuthTokenStorageManager.getToken(discordId);
          const expirationDate = new Date(new Date(token.expirationDate).getTime());
          const daysToRemove = parseInt(await input({ message: 'Enter amount of days you want to add'}));
          expirationDate.setDate(expirationDate.getDate() - daysToRemove);
          await AuthTokenStorageManager.updateToken(discordId, expirationDate);
          await getBackToAdminPanel(discordId);
        } catch (error){
          if (error instanceof SyntaxError){
            console.log("Amount of days was typed incorrectly. Try again.");
          } else {
            console.log(`Error occurred while removing days:`, error);
          }
        } 

      case 'show-all-tokens':
        const tokens: AuthToken[] = await AuthTokenStorageManager.getTokens();
        
        for (const token of tokens){
          const remainingDays: number = await AuthTokenManager.getExpirationsDaysCount(new Date(token.expirationDate));
          console.log('\n'.repeat(1) + '='.repeat(75) + '\n'.repeat(1));

          console.log(`Discord ID: ${bold(token.discordID)}`);
          console.log(`Auth Token: ${bold(token.token)}`);
          console.log(`Remaining days: ${bold(remainingDays)}`)

          console.log('\n'.repeat(1) + '='.repeat(75));
        }

        await getBackToAdminPanel(discordId);
        
      case 'switch-user':
        const discordIdForAdminPanel = await input({ message: 'Enter Discord ID'});
        await cliAdminPanel(discordIdForAdminPanel);
        console.clear();

      case 'main-menu':
        await cli();

      case 'exit':
        exit();
    } 
  } else {
    console.log(bold('- User with such Discord ID does not exists!'));
    await getBackToMainMenu();
  }

}

async function cli(){
  await figlet('FILTRED AUTH', {
        font: 'Graffiti',
        horizontalLayout: 'default',
        verticalLayout: 'default',
        width: 100,
        whitespaceBreak: true
      }, (err, data) => {
        if (err) {
          console.error('Something went wrong:', err);
          return;
        }
        console.log(data);
      });
    console.log(bold('- Welcome @moonwz!'));
  
    const answer = await select({
      message: 'Select an option.',
      choices: [
        {
          name: 'Generate Auth Token',
          value: 'auth',
          description: 'Moves you to panel for token generation.',
        },
        {
          name: 'Manage Auth Tokens',
          value: 'manage',
          description: 'Moves you to Admin Panel.',
        },
        {
          name: 'Generate .env configuration file',
          value: 'dotenv-generator',
          description: 'Generates file for API. Use it when you freshly configured project on your server.',
        },
        {
          name: 'Exit',
          value: 'exit',
          description: 'Exit from CLI.',
        },
      ],
    });
    

    switch (answer) {
        case 'auth':
            const period = parseInt(await select({
                message: 'Select plan.',
                choices: [
                  {
                    name: '30 days',
                    value: '30',
                  },
                  {
                    name: '90 days',
                    value: '90',
                  },
                  {
                    name: '360 days',
                    value: '360',
                  },
                ],
              }));

            await sleep(500);

            const discordId = await input({ message: 'Enter Discord ID'});
            const doesTokenExists: boolean = await AuthTokenStorageManager.doesTokenExists(discordId);

            if (!doesTokenExists){
              const generatedToken: string = await AuthTokenManager.generateToken(discordId);
              const generatedDate: Date = await AuthTokenManager.generateDate(period);
              const token: AuthToken = { discordID: discordId, token: generatedToken, expirationDate: generatedDate};

              if (await AuthTokenStorageManager.addToken(token)){
                console.log(bold(`- Successfully generated and saved token:\n${generatedToken}`));
              }

              await sleep(500);
              await getBackToMainMenu();
            } else {
              await sleep(500);
              console.log(bold('- Token for this user already exists in system.'));

              const toRewrite = await confirm({ message: 'Rewrite token for this user?' });
              if (toRewrite){
                const generatedDate: Date = await AuthTokenManager.generateDate(period);
                await AuthTokenStorageManager.updateToken(discordId, generatedDate);
              } else {
              }
              
              await getBackToMainMenu();
            }
            
        case 'manage':
          console.clear();
          const discordIdForAdminPanel = await input({ message: 'Enter Discord ID'});
          await cliAdminPanel(discordIdForAdminPanel);
         
        case 'dotenv-generator':
          const dotenvPath: string = join(__dirname, '.env');
          try{
            await fs.access(dotenvPath, undefined);
            console.log(bold('File .env already exists.'));
            await getBackToMainMenu();
          } catch (error){
            const PORT = '3000';
  
            const envContent = `
            PORT=${PORT}
            `;
  
            fs.promises.writeFile(dotenvPath, envContent.trim());
            await getBackToMainMenu();
          }

        case 'exit':
          exit();
           
    }
}

async function main(){
    console.clear();

    await sleep(250);

    await cli();
}

main().catch((error) => {
    console.error(`Error occurred: ${error}`);
});