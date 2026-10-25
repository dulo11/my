self.onmessage=({data:{text,pattern}})=>{
  try{
    const regex=new RegExp(pattern,'g'),matches=[];
    for(const m of text.matchAll(regex)){matches.push({text:m[0],index:m.index});if(matches.length>=100)break}
    self.postMessage({result:JSON.stringify(matches,null,2)});
  }catch(e){self.postMessage({error:e.message})}
};
