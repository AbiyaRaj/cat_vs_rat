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
export const LION_B={label:'Lion',len:1.3,wid:1.22,leg:1.3,legW:1.8,head:19,muzzle:11,ear:'round',earSize:.8,fluff:.12,tail:[7,4],tailLen:1.22,tailFluff:0,pattern:'solid',scale:2.0,mane:true,tuft:true,eye:1.15,cheek:1.1};
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
  red:{label:'Red',base:'#c8322a',light:'#e8685a',dark:'#7e1a14',stripe:'rgba(90,10,6,.45)'},
  orange:{label:'Orange',base:'#f07a18',light:'#ffa94d',dark:'#b04e08',stripe:'rgba(130,50,0,.45)'},
  pink:{label:'Pink',base:'#ef8fb4',light:'#ffc2da',dark:'#b8587e',stripe:'rgba(150,40,90,.35)'},
  magenta:{label:'Magenta',base:'#c8288c',light:'#ee68bc',dark:'#7a0f54',stripe:'rgba(90,0,60,.45)'},
  purple:{label:'Purple',base:'#7a46c0',light:'#a77ce6',dark:'#43207a',stripe:'rgba(40,10,80,.45)'},
  lavender:{label:'Lavender',base:'#b9a2e0',light:'#ddd0f4',dark:'#8068b0',stripe:'rgba(80,50,130,.35)'},
  navy:{label:'Navy',base:'#2f4a8a',light:'#5874b8',dark:'#162650',stripe:'rgba(10,20,60,.45)'},
  teal:{label:'Teal',base:'#1f9a9a',light:'#5cc8c4',dark:'#0e5c5e',stripe:'rgba(0,50,50,.45)'},
  mint:{label:'Mint',base:'#86d6b0',light:'#bdf0d6',dark:'#4f9c7a',stripe:'rgba(30,90,60,.35)'},
  golden:{label:'Golden',base:'#e0b22e',light:'#f6d872',dark:'#9a7410',stripe:'rgba(110,70,0,.4)'},
};
export const EYES={ green:{label:'Green',c:['#c9f07a','#4f9a1f']}, amber:{label:'Amber',c:['#ffe57a','#d08a06']}, blue:{label:'Blue',c:['#9fe0ff','#1f6fd1']},
  copper:{label:'Copper',c:['#ffc27a','#b3570e']}, odd:{label:'Odd-eyed',c:['#9fe0ff','#1f6fd1'],c2:['#ffe57a','#d08a06']} };
export const COLLARS={ none:{label:'None',c:null}, red:{label:'Red',c:'#e02424'}, blue:{label:'Blue',c:'#2563eb'}, pink:{label:'Pink',c:'#ff3e9a'}, green:{label:'Green',c:'#16a34a'}, purple:{label:'Purple',c:'#8b3dff'} };
// accessories: tier 'free' | 'wave' (unlocks once that wave is reached) | 'premium' (price in ₹). col = default colour
export const ACC_COLOURS=['#e5484d','#ff8a3d','#ffd23f','#3fbf6a','#2f8cff','#7a46c0','#ff6fa8','#1b1b1f','#f4f1ea','#8a5a32','#c9a227','#9aa3ad'];
export const HATS={ none:{label:'None',tier:'free'},
  party:{label:'🎉 Party',tier:'free',col:'#ff4f8b'}, beanie:{label:'🧶 Beanie',tier:'free',col:'#e5484d'}, cap:{label:'🧢 Baseball cap',tier:'free',col:'#2f8cff'}, flowers:{label:'🌸 Flowers',tier:'free',col:'#ff6fa8'},
  cowboy:{label:'🤠 Cowboy',tier:'wave',wave:5,col:'#8a5a2b'}, beret:{label:'🎨 Beret',tier:'wave',wave:7,col:'#c0392b'}, newsboy:{label:'🗞️ Newsboy',tier:'wave',wave:9,col:'#8d8a80'},
  boater:{label:'👒 Boater',tier:'wave',wave:11,col:'#e8cf8a'}, sailor:{label:'⚓ Sailor',tier:'wave',wave:13,col:'#f4f1ea'}, fedora:{label:'🕵️ Fedora',tier:'wave',wave:15,col:'#4a4038'},
  toque:{label:'👨‍🍳 Chef toque',tier:'wave',wave:17,col:'#f4f1ea'}, mortar:{label:'🎓 Mortarboard',tier:'wave',wave:20,col:'#1b1b1f'},
  crown:{label:'👑 Crown',tier:'premium',price:15,col:'#f4c430'}, halo:{label:'😇 Halo',tier:'premium',price:10,col:'#ffd23f'}, tophat:{label:'🎩 Top hat',tier:'premium',price:8,col:'#1b1b1f'},
  turban:{label:'🧕 Turban',tier:'premium',price:6,col:'#e8892a'}, peaked:{label:'🎖️ Peaked cap',tier:'premium',price:5,col:'#1f3a6a'}, witch:{label:'🧙 Witch hat',tier:'premium',price:7,col:'#3a2468'},
  milberet:{label:'🪖 Military beret',tier:'premium',price:4,col:'#4f5a2e'}, jester:{label:'🃏 Joker hat',tier:'premium',price:9,col:'#7a46c0'}, starhelm:{label:'⭐ Star hero helmet',tier:'premium',price:12,col:'#2a4fa8'},
  dracula:{label:'🧛 Dracula hat',tier:'premium',price:11,col:'#1b1b1f'} };
export const OUTFITS={ none:{label:'None',tier:'free'},
  tshirt:{label:'👕 T-shirt',tier:'free',col:'#2f8cff'}, hoodie:{label:'🧥 Hoodie',tier:'free',col:'#9aa3ad'}, sweater:{label:'🧶 Sweater',tier:'free',col:'#2e9e6a'}, raincoat:{label:'🌂 Raincoat',tier:'free',col:'#ffd21f'},
  cape:{label:'🦸 Hero cape',tier:'wave',wave:5,col:'#d62839'}, tux:{label:'🎀 Bow tie',tier:'wave',wave:7,col:'#141414'}, riders:{label:'🏍️ Rider jacket',tier:'wave',wave:9,col:'#1e1b1a'},
  snowjacket:{label:'⛷️ Snow jacket',tier:'wave',wave:11,col:'#2f8cff'}, blazer:{label:'🕴️ Blazer',tier:'wave',wave:13,col:'#2a3a5e'}, hawaiian:{label:'🌺 Hawaiian shirt',tier:'wave',wave:15,col:'#ff8a3d'},
  jersey:{label:'🏆 Sports jersey',tier:'wave',wave:17,col:'#e5484d'}, ninja:{label:'🥷 Ninja suit',tier:'wave',wave:19,col:'#1b1b1f'},
  dragon:{label:'🐉 Red dragon',tier:'premium',price:15,col:'#c0201a'}, dracula:{label:'🧛 Dracula suit',tier:'premium',price:10,col:'#141414'}, iron:{label:'🦾 Iron armour hero',tier:'premium',price:14,col:'#b8201c'},
  starshield:{label:'🛡️ Star shield hero',tier:'premium',price:13,col:'#1f4fb8'}, webhero:{label:'🕸️ Web-slinger',tier:'premium',price:13,col:'#d0201c'}, darkknight:{label:'🦇 Dark knight',tier:'premium',price:13,col:'#2c2f36'},
  steelhero:{label:'💎 Man of steel',tier:'premium',price:12,col:'#1f5fd0'}, thunder:{label:'⚡ Thunder god',tier:'premium',price:12,col:'#9aa3ad'}, wonder:{label:'🌟 Wonder warrior',tier:'premium',price:12,col:'#c8202a'},
  speedster:{label:'💨 Speedster',tier:'premium',price:11,col:'#d81e1e'}, royal:{label:'👑 Royal robe',tier:'premium',price:14,col:'#8a1030'}, astronaut:{label:'🚀 Astronaut',tier:'premium',price:9,col:'#f4f1ea'},
  knight:{label:'⚔️ Knight armour',tier:'premium',price:9,col:'#b8c0c8'}, pirate:{label:'🏴‍☠️ Pirate coat',tier:'premium',price:8,col:'#8a1a1a'}, wizard:{label:'🔮 Wizard robe',tier:'premium',price:7,col:'#3a2a8a'},
  kimono:{label:'🎎 Kimono',tier:'premium',price:6,col:'#e8507a'}, firefighter:{label:'🚒 Firefighter',tier:'premium',price:6,col:'#d9a43a'}, police:{label:'👮 Police',tier:'premium',price:5,col:'#1f2f5a'},
  chef:{label:'👨‍🍳 Chef whites',tier:'premium',price:4,col:'#f4f1ea'}, doctor:{label:'🩺 Doctor coat',tier:'premium',price:3,col:'#f4f1ea'}, tracksuit:{label:'🏃 Tracksuit',tier:'premium',price:2,col:'#2e9e6a'} };
export const GLASSES={ none:{label:'None',tier:'free'},
  sun:{label:'🕶️ Shades',tier:'free',col:'#151515'}, round:{label:'👓 Round',tier:'free',col:'#c9a227'}, heart:{label:'💖 Hearts',tier:'free',col:'#ff3e8a'}, aviator:{label:'🛩️ Aviator',tier:'free',col:'#c9a227'},
  nerd:{label:'🤓 Geek frames',tier:'wave',wave:6,col:'#151515'}, cateye:{label:'🐱 Cat-eye',tier:'wave',wave:8,col:'#c8288c'}, star:{label:'⭐ Star shades',tier:'wave',wave:10,col:'#ffd23f'},
  sport:{label:'🏄 Sport wrap',tier:'wave',wave:12,col:'#ff8a3d'}, threed:{label:'🎬 3D glasses',tier:'wave',wave:14,col:'#f4f1ea'}, steampunk:{label:'⚙️ Steampunk goggles',tier:'wave',wave:16,col:'#8a5a32'},
  ski:{label:'🎿 Ski goggles',tier:'wave',wave:18,col:'#2f8cff'}, monocle:{label:'🧐 Monocle',tier:'wave',wave:20,col:'#c9a227'},
  thug:{label:'😎 Thug life',tier:'premium',price:5,col:'#151515'}, cyber:{label:'🤖 Cyber visor',tier:'premium',price:12,col:'#00d4ff'}, bling:{label:'💎 Diamond bling',tier:'premium',price:15,col:'#e8eef5'},
  flame:{label:'🔥 Flame shades',tier:'premium',price:7,col:'#ff5a1a'}, rainbow:{label:'🌈 Rainbow lenses',tier:'premium',price:4,col:'#f4f1ea'}, butterfly:{label:'🦋 Butterfly',tier:'premium',price:3,col:'#7a46c0'},
  vr:{label:'🥽 VR headset',tier:'premium',price:10,col:'#f4f1ea'}, scuba:{label:'🤿 Scuba mask',tier:'premium',price:2,col:'#ffd23f'} };
// three difficulty modes: rat speed multiplier, spawn-gap multiplier, score multiplier
// m: rat speed, gap: time between arrivals, pts: score, reach: catch radius, small: extra speed factor for the small mice,
// fear: how hard they dodge the cat, ramp: how much faster each later wave gets, count: rodents per wave
export const LEVELS={
  easy:  {label:'🌱 Easy',  nibble:.55,m:.62,gap:1.5, pts:.6, reach:1.5, small:.62,fear:.45,ramp:.45,count:.75},
  normal:{label:'⚖️ Normal',nibble:.9,m:.85,gap:1.15,pts:1,  reach:1.22,small:.82,fear:.75,ramp:.75,count:.9},
  hard:  {label:'🔥 Hard',  nibble:1.35,m:1.1,gap:.85, pts:1.6,reach:1,   small:1,  fear:1,  ramp:1,  count:1} };
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
};
// new scenes, built on the spring garden; 'weather' drives rain, storms, mist, rainbows, frost sparkle and snowfall
const G0=THEMES.garden, SN=THEMES.winter;
Object.assign(THEMES,{
  morning:{...G0,label:'Clear Morning',sky:['#8fc4f2','#ffe2c4'],fog:'#f2e2d0',sun:['#ffd9b0',1.05],hemi:['#ffe9d6','#5f8a3a',.75],sunPos:[-.6,.55,.5],flowers:['daisy','daisy','buttercup','violet']},
  sunny:{...G0,label:'Sunny Afternoon',sky:['#3f8ef0','#cfe9ff'],fog:'#d6ebfb',sun:['#fff6e0',1.45],hemi:['#dff0ff','#5a8a2c',.8],sunPos:[.25,1.3,.35],bugs:{ants:1,ladybugs:1,beetles:1,butterflies:1.4,bees:1.4}},
  summer:{...G0,label:'Hot Summer',ground:['#7e9a34','#6a8a2a'],patches:['200,190,90','70,80,20'],grass:[55,80,40,60,26,46],sky:['#2f86ee','#fff4cc'],fog:'#f4ecc8',sun:['#fff2c8',1.55],hemi:['#fff4d6','#7a8a30',.8],flowers:['dandelion','buttercup','poppy','dandelion'],bugs:{ants:1,ladybugs:1,beetles:1,butterflies:1.6,bees:1.8},outer:'#6f8a2a'},
  rainbow:{...G0,label:'Rainbow After Rain',sky:['#6a9ad8','#e6f2ff'],fog:'#d8e6f2',sun:['#fff4e0',1.15],hemi:['#e6f0ff','#4f7a2c',.8],weather:'rainbow',ground:['#468a2c','#377a22']},
  rain:{...G0,label:'Rainy Day',sky:['#6d7a86','#aab4bc'],fog:'#9aa6b0',sun:['#e6eef6',.55],hemi:['#c6d2dc','#3e5a2a',.85],weather:'rain',sound:'rain',bugs:{ants:1,beetles:1},ground:['#3f7a26','#30661c']},
  storm:{...G0,label:'Thunderstorm',night:true,sky:['#1c2230','#3c4656'],fog:'#2a3240',sun:['#9aa8c0',.35],hemi:['#55627a','#1a2a14',.5],weather:'storm',sound:'rain',bugs:{},ground:['#2f6a20','#24561a']},
  mist:{...G0,label:'Misty Morning',sky:['#c4ccd2','#e4e8ea'],fog:'#d6dcdf',sun:['#f2f2ee',.7],hemi:['#e6eaec','#4f6a3a',.85],weather:'mist',sound:'birdsRare',bugs:{ants:1}},
  frost:{...SN,label:'Frost & Ice',ground:['#dfeaf2','#c8d8e4'],patches:['235,245,255','150,180,210'],sky:['#9cc4e4','#eef6fc'],fog:'#e2eef6',sun:['#f2f8ff',1.1],hemi:['#eef6ff','#a8c0d4',.85],weather:'frost',ambient:null,footprints:true},
  snowfall:{...SN,label:'Snowfall',sky:['#9aa8b8','#dde4ec'],fog:'#d4dce4',sun:['#eef2f8',.75],weather:'snowfall',ambient:'snow'},
});
THEMES.winter={...SN,label:'Winter',ambient:null,sound:'birdsRare'};   // snowy yard under a clear cold sky (snowfall has its own scene)
// which scene each wave uses; harder modes reach the dark, low-visibility scenes sooner
export const SCENE_PLAN={
  easy:  ['garden','morning','sunny','summer','rainbow','morning','autumn','sunny','rain','summer','rainbow','frost','winter','autumn','mist','snowfall','rain','night','storm','rainbow'],
  normal:['garden','morning','sunny','night','rain','summer','rainbow','autumn','mist','night','frost','winter','snowfall','rain','storm','mist','night','frost','storm','night'],
  hard:  ['garden','morning','night','rain','mist','storm','night','frost','snowfall','mist','storm','night','winter','storm','mist','night','storm','snowfall','night','storm'] };
