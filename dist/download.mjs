// 先准备文件，再由用户直接点击下载链接；Safari 不再导航到临时 blob: 地址。
const XLSX_TYPE='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function prepareDownload(bytes,name,type=XLSX_TYPE){
  return new Promise((resolve,reject)=>{
    const blob=new Blob([bytes],{type}),reader=new FileReader();
    reader.onload=()=>resolve({href:reader.result,name,size:blob.size});
    reader.onerror=()=>reject(new Error('无法准备下载文件，请重试。'));
    reader.onabort=()=>reject(new Error('文件准备已取消，请重试。'));
    reader.readAsDataURL(blob);
  });
}

function downloadDialog(){
  let dialog=document.getElementById('downloadDialog');
  if(dialog)return dialog;
  dialog=document.createElement('dialog');dialog.id='downloadDialog';
  dialog.setAttribute('aria-labelledby','downloadTitle');
  dialog.innerHTML='<div class="dialog-top"><h2 id="downloadTitle">文件已生成</h2><button id="closeDownload" class="icon-button" aria-label="关闭下载窗口">×</button></div><div class="dialog-body"><p id="downloadFilename" class="download-filename"></p><p id="downloadHint">请点击下方“保存文件”，将文件保存到电脑。</p><a id="saveDownload" class="primary download-link">保存文件</a><p class="detail-note">如浏览器询问是否允许下载，请选择允许。下载进度可在浏览器的下载列表中查看。</p></div>';
  document.body.append(dialog);
  dialog.querySelector('#closeDownload').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>dialog.querySelector('#saveDownload').removeAttribute('href'));
  return dialog;
}

export async function saveFile(bytes,name,type=XLSX_TYPE){
  const file=await prepareDownload(bytes,name,type),dialog=downloadDialog();
  const link=dialog.querySelector('#saveDownload');
  link.href=file.href;link.download=file.name;link.removeAttribute('target');
  dialog.querySelector('#downloadFilename').textContent=`${file.name}（${file.size<1024*1024?(file.size/1024).toFixed(1)+' KB':(file.size/1024/1024).toFixed(1)+' MB'}）`;
  dialog.querySelector('#downloadHint').textContent='请点击下方“保存文件”，将文件保存到电脑。';
  if(!dialog.open)dialog.showModal();
  link.focus();
}
