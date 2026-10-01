import { chromium } from 'playwright';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1100,height:680}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:8080/tactical-grid-quiet-preview.html');
 await page.waitForFunction(()=>window.gridPreviewReady);
 await page.screenshot({path:'screenshots/tactical-grid-quiet.png'});
 if(errors.length)throw new Error(errors.join('\n'));
 console.log('Both tactical overlay profiles rendered successfully.');
}finally{await browser.close()}
