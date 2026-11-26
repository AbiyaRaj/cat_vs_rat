// Game content: breeds, colours, outfits, levels, camera views, scenes.
export const BREEDS={
  street:  {label:'Street Cat',    len:1,   wid:1,   leg:1,   legW:1,   head:15,  muzzle:7,  ear:'normal',earSize:1,   fluff:.25,tail:[9,5],  tailLen:1,   tailFluff:0, pattern:'tabby', bicolor:true},
  persian: {label:'Persian',       len:.92, wid:1.28,leg:.8,  legW:1.25,head:17.5,muzzle:3.5,ear:'small', earSize:.75, fluff:1,  tail:[13,9], tailLen:.85, tailFluff:1, pattern:'solid', cheek:1.16, eye:1.32, eyeRound:true, bicolor:true, ruff:true,
    furStyle:{len:2.1,cell:.4,grav:1.7,ao:.86,tint:.08,rad:.78,sheen:-.18}},  // Pixar-style Persian: plush, silky, smooth coat
  siamese: {label:'Siamese',       len:1.1, wid:.84, leg:1.15,legW:.85, head:13.5,muzzle:9.5,ear:'big',   earSize:1.35,fluff:.08,tail:[7,3],  tailLen:1.15,tailFluff:0, pattern:'point'},
  curl:    {label:'American Curl', len:1,   wid:1,   leg:1,   legW:1,   head:15,  muzzle:7,  ear:'curl',  earSize:1.15,fluff:.45,tail:[10,6], tailLen:1,   tailFluff:.5,pattern:'tabby', stripeA:.6, bicolor:true},
  savannah:{label:'Savannah',      len:1.2, wid:.92, leg:1.35,legW:.85, head:14,  muzzle:8.5,ear:'big',   earSize:1.55,fluff:.08,tail:[9,6],  tailLen:.8,  tailFluff:0, pattern:'spotted', scale:1.12},
  fold:    {label:'Scottish Fold', len:.95, wid:1.1, leg:.95, legW:1.05,head:16.5,muzzle:6,  ear:'fold',  earSize:.9,  fluff:.35,tail:[10,6], tailLen:.95, tailFluff:.2,pattern:'tabby', eye:1.1, eyeRound:true, bicolor:true},
  ragdoll: {label:'Ragdoll',       len:1.08,wid:1.2, leg:1,   legW:1.15,head:16.5,muzzle:6.5,ear:'normal',earSize:.95, fluff:.9, tail:[13,9], tailLen:1,   tailFluff:1, pattern:'mitted', scale:1.08},
  van:     {label:'Turkish Van',   len:1.05,wid:1,   leg:1.05,legW:1,   head:15,  muzzle:7,  ear:'normal',earSize:1.05,fluff:.5, tail:[12,8], tailLen:1,   tailFluff:.7,pattern:'van'},
  sphynx:  {label:'Sphynx',        len:1,   wid:.9,  leg:1.1, legW:.9,  head:14,  muzzle:7.5,ear:'big',   earSize:1.6, fluff:0,  tail:[6,1.5],tailLen:1.1, tailFluff:0, pattern:'skin'},
};
export const LION_B={label:'Lion',len:1.5,wid:1.22,leg:1.3,legW:1.8,head:19,muzzle:11,ear:'round',earSize:.95,fluff:.12,tail:[7,4],tailLen:1.22,tailFluff:0,pattern:'solid',scale:2.0,mane:true,tuft:true,eye:1.3,cheek:1.08};
export const COLORS={
  ginger:{label:'Ginger',base:'#e9862c',light:'#ffb466',dark:'#a85a1c',stripe:'rgba(140,60,10,.45)'},
  cream:{label:'Cream',base:'#e8c08e',light:'#f8e0bc',dark:'#be925e',stripe:'rgba(160,110,60,.35)'},
  brown:{label:'Brown',base:'#8f6c47',light:'#bc986e',dark:'#4e3622',stripe:'rgba(40,24,10,.5)'},
  chocolate:{label:'Chocolate',base:'#62402a',light:'#865c3f',dark:'#301d10',stripe:'rgba(20,10,4,.45)'},
  grey:{label:'Grey',base:'#8f8d89',light:'#c0bdb7',dark:'#585550',stripe:'rgba(40,40,40,.45)'},
  silver:{label:'Silver',base:'#b9bec4',light:'#eceff2',dark:'#7e848c',stripe:'rgba(30,30,36,.5)'},
  blue:{label:'Blue',base:'#7f8896',light:'#a9b2be',dark:'#4e5560',stripe:'rgba(30,35,45,.4)'},
  black:{label:'Black',base:'#2c2727',light:'#4c4442',dark:'#121010',stripe:'rgba(0,0,0,.3)'},
  white:{label:'White',base:'#f1ede6',light:'#ffffff',dark:'#cfc8bd',stripe:'rgba(150,140,130,.25)'},
  calico:{label:'Calico',base:'#f3eee4',light:'#ffffff',dark:'#d3cabb',stripe:null,calico:true},
};
export const EYES={ green:{label:'Green',c:['#c9f07a','#4f9a1f']}, amber:{label:'Amber',c:['#ffe57a','#d08a06']}, blue:{label:'Blue',c:['#9fe0ff','#1f6fd1']},
  copper:{label:'Copper',c:['#ffc27a','#b3570e']}, odd:{label:'Odd-eyed',c:['#9fe0ff','#1f6fd1'],c2:['#ffe57a','#d08a06']} };
export const COLLARS={ none:{label:'None',c:null}, red:{label:'Red',c:'#e02424'}, blue:{label:'Blue',c:'#2563eb'}, pink:{label:'Pink',c:'#ff3e9a'}, green:{label:'Green',c:'#16a34a'}, purple:{label:'Purple',c:'#8b3dff'} };
export const HATS={ none:{label:'None'}, party:{label:'🎉 Party'}, tophat:{label:'🎩 Top hat'}, crown:{label:'👑 Crown'}, cowboy:{label:'🤠 Cowboy'}, beanie:{label:'🧶 Beanie'}, flowers:{label:'🌸 Flowers'} };
export const OUTFITS={ none:{label:'None'}, tshirt:{label:'👕 T-shirt'}, hoodie:{label:'🧥 Hoodie'}, sweater:{label:'🧶 Sweater'}, cape:{label:'🦸 Hero cape'}, tux:{label:'🎀 Bow tie'}, raincoat:{label:'🌂 Raincoat'} };
export const GLASSES={ none:{label:'None'}, sun:{label:'🕶️ Shades'}, round:{label:'👓 Round'}, heart:{label:'💖 Hearts'} };
// three difficulty modes: rat speed multiplier, spawn-gap multiplier, score multiplier
export const LEVELS={ easy:{label:'🌱 Easy',m:.72,gap:1.35,pts:.6}, normal:{label:'⚖️ Normal',m:.92,gap:1.1,pts:1}, hard:{label:'🔥 Hard',m:1.15,gap:.85,pts:1.6} };
export const VIEWS={ angle:{label:'📐 3D angle'}, top:{label:'⬇️ Top-down'}, follow:{label:'🎥 Follow cam'}, orbit:{label:'🔄 360° orbit'} };
export const TREATS=[{id:'drumstick',label:'Chicken drumstick',emoji:'🍗'},{id:'fish',label:'Fresh sardine',emoji:'🐟'},{id:'steak',label:'Juicy steak',emoji:'🥩'},{id:'sausage',label:'Sausage',emoji:'🌭'},
  {id:'salmon',label:'Salmon fillet',emoji:'🍣'},{id:'shrimp',label:'Prawn',emoji:'🍤'},{id:'meatballs',label:'Meatballs',emoji:'🧆'},{id:'ham',label:'Slice of ham',emoji:'🍖'},{id:'tuna',label:'Can of tuna',emoji:'🥫'},{id:'lambchop',label:'Lamb chop',emoji:'🍖'}];
export const SHIRTS=['#2f6db5','#c0392b','#2e8b57','#6c4ab6','#e67e22','#34495e'];
export const LEAF_COLORS=['#d9541e','#e8892a','#f2b632','#b8321a','#9a5a22','#c97a2a'];
export const THEMES={
  garden:{label:'Spring Garden',kind:'grass',ground:['#4d8a2a','#3c7421'],patches:['120,170,60','30,70,20'],blade:[78,112,40,65,20,46],bladeDiv:80,clover:true,pebbles:1,flowers:['daisy','daisy','dandelion','poppy','violet','violet','buttercup'],flowerDiv:30000,
    dirt:['#6b4a2c','#86603a','#5a3c22'],bugs:{ants:1,ladybugs:1,beetles:1,butterflies:1,bees:1},ambient:null,sound:'birds',sky:['#6fa8f0','#dceefc'],fog:'#cfe3f3',sun:['#fff2dc',1.25],hemi:['#d6ecff','#4f7a2c',.75],grass:[85,118,40,62,24,44],grassN:1,fence:'wood',outer:'#447f25'},
  autumn:{label:'Autumn Park',kind:'grass',ground:['#7d7a30','#5f5f25'],patches:['190,130,40','70,55,20'],blade:[38,70,35,55,22,42],bladeDiv:95,clover:false,pebbles:1,flowers:[],fallen:true,
    dirt:['#5e4026','#7a5634','#4a3018'],bugs:{ants:1,ladybugs:1,beetles:1,butterflies:.4},ambient:'leaves',sound:'birds',sky:['#e59a52','#fde3bd'],fog:'#efd2a6',sun:['#ffd59a',1.2],hemi:['#ffe2bb','#6b5a2a',.7],grass:[36,62,40,58,26,44],grassN:.8,fence:'wood',outer:'#6a6526'},
  night:{label:'Moonlit Garden',kind:'grass',ground:['#3f7a26','#30661d'],patches:['90,150,60','20,50,15'],blade:[85,120,35,55,18,40],bladeDiv:80,clover:true,pebbles:1,flowers:['daisy','violet','daisy'],flowerDiv:45000,
    dirt:['#5a3e25','#735233','#4a3018'],bugs:{ants:1,beetles:1},ambient:'fireflies',sound:'crickets',night:true,sky:['#040a1c','#18284a'],fog:'#0a1428',sun:['#a9c0ff',.45],hemi:['#3a4c80','#0e1a0e',.32],grass:[90,125,35,55,16,32],grassN:1,fence:'wood',outer:'#1f3a16'},
  winter:{label:'Snowy Yard',kind:'snow',ground:['#f4f8fb','#dde7ef'],patches:['255,255,255','150,178,205'],blade:[38,52,20,35,38,58],bladeDiv:1400,clover:false,pebbles:.4,flowers:[],
    dirt:['#6f7f8c','#c7d3dd','#ffffff'],bugs:{},ambient:'snow',sound:'birdsRare',footprints:true,sky:['#aac2da','#eef4fa'],fog:'#e3ebf3',sun:['#ffffff',1.0],hemi:['#eef4ff','#c8d4e0',.85],grass:[38,52,15,30,45,62],grassN:.1,fence:'snow',outer:'#e8eef4'},
  kitchen:{label:'Kitchen Floor',kind:'tiles',bugs:{ants:1},ambient:null,sound:null,sky:['#2a1c12','#4a3424'],fog:'#3a2a1e',sun:['#fff1d6',1.0],hemi:['#fff3e0','#8a6a40',.8],grass:null,fence:null,walls:true,outer:'#4a2f1c'},
};
