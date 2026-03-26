import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import OpenAI,{toFile} from "openai";

dotenv.config();

const app = express();

app.use(cors({
    origin:"*"
}));

app.use(express.json({
    limit:"20mb"
}));

const upload = multer({
    storage:multer.memoryStorage()
});

const openai = new OpenAI({
    apiKey:process.env.OPENAI_KEY
});

const DEEPSEEK_KEY =
process.env.DEEPSEEK_KEY;

/* health check */

app.get("/",(req,res)=>{

res.json({

status:"ok",

service:"LectureLens API",

time:new Date()

});

});

/* speech to text */

app.post(
"/transcribe",
upload.single("audio"),
async(req,res)=>{

try{

if(!process.env.OPENAI_KEY){

return res.status(500).json({

error:"OPENAI_KEY missing"

});

}

if(!req.file){

return res.status(400).json({

error:"no audio"

});

}

const file =
await toFile(

req.file.buffer,

"lecture.webm",

{

type:req.file.mimetype ||
"audio/webm"

}

);

const response =
await openai.audio.transcriptions.create({

file:file,

model:"whisper-1"

});

res.json({

text:response.text || ""

});

}
catch(e){

console.log("transcribe error");

console.log(e);

res.status(500).json({

error:"transcribe failed"

});

}

}
);

/* lecture analysis */

app.post(
"/analyze",
async(req,res)=>{

try{

if(!DEEPSEEK_KEY){

return res.status(500).json({

error:"DEEPSEEK_KEY missing"

});

}

const text =
req.body?.text;

if(!text){

return res.status(400).json({

error:"text empty"

});

}

const prompt = `
请分析课堂内容并返回JSON：

{
"translation":"",
"summary":"",
"terms":[""],
"exam_points":[""]
}

要求：

translation：
翻译中文

summary：
总结重点

terms：
3-5专业词

exam_points：
2-4考试重点

课堂：

${text}
`;

const r =
await fetch(

"https://api.deepseek.com/v1/chat/completions",

{

method:"POST",

headers:{

"Content-Type":"application/json",

Authorization:`Bearer ${DEEPSEEK_KEY}`

},

body:JSON.stringify({

model:"deepseek-chat",

temperature:0.2,

messages:[

{

role:"user",

content:prompt

}

]

})

}

);

const data =
await r.json();

if(!r.ok){

console.log(data);

return res.status(500).json({

error:"deepseek error"

});

}

const content =
data.choices?.[0]?.message?.content || "";

try{

const json =
JSON.parse(content);

res.json(json);

}
catch{

const match =
content.match(/\{[\s\S]*\}/);

if(match){

try{

res.json(
JSON.parse(match[0])
);

return;

}
catch{}

}

res.json({

translation:content,

summary:"",

terms:[],

exam_points:[]

});

}

}
catch(e){

console.log("analyze error");

console.log(e);

res.status(500).json({

error:"analyze failed"

});

}

}
);

/* start server */

const PORT =
process.env.PORT || 3000;

app.listen(PORT,()=>{

console.log(

"LectureLens server running"

);

console.log(

"PORT:",PORT

);

});