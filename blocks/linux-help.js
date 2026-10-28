'use strict';
(()=>{
 const platform=navigator.userAgentData?.platform||navigator.platform||'';
 const ua=navigator.userAgent||'';
 const linux=!/Android|CrOS/i.test(ua+' '+platform)&&(/Linux/i.test(platform)||/Linux/i.test(ua));
 const get=id=>document.getElementById(id);
 const dialog=get('linuxHelpDialog');
 function show(failed=false){
  get('linuxHelpReason').textContent=failed?'Chrome found the serial port but could not open it. Possible causes include Linux permissions, another application using the port, or browser sandbox restrictions.':'On Ubuntu/Kubuntu, your account normally needs dialout membership to access the CJP serial port.';
  get('linuxCopyStatus').textContent='';
  if(!dialog.open)dialog.showModal();
 }
 get('linuxSetup').hidden=!linux;
 get('linuxSetup').onclick=()=>show();
 get('closeLinuxHelp').onclick=()=>dialog.close();
 get('copyLinuxCommand').onclick=async()=>{
  const command=get('linuxCommand').textContent;
  try{await navigator.clipboard.writeText(command);get('linuxCopyStatus').textContent='Command copied. Run it on this Linux computer, then fully log out and back in.';}
  catch{const selection=window.getSelection();const range=document.createRange();range.selectNodeContents(get('linuxCommand'));selection.removeAllRanges();selection.addRange(range);get('linuxCopyStatus').textContent='Clipboard unavailable. The command is selected; copy it manually.';}
 };
 window.CjpLinuxHelp={openFailure(){if(linux)show(true);}};
})();
