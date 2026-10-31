const R=6371000,rad=Math.PI/180;
export function meters(a,b){const h=Math.sin((b[1]-a[1])*rad/2)**2+Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin((b[0]-a[0])*rad/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));}
export function cumulative(coordinates){const values=[0];for(let i=1;i<coordinates.length;i++)values.push(values[i-1]+meters(coordinates[i-1],coordinates[i]));return values;}
export function project(point,coordinates,lengths,previous=0){
  const scaleX=R*rad*Math.cos(point[1]*rad),scaleY=R*rad;
  let best={distance:Infinity,progress:0,index:0,coordinate:coordinates[0]},bestScore=Infinity;
  for(let i=0;i<coordinates.length-1;i++){
    const a=coordinates[i],b=coordinates[i+1],ax=(a[0]-point[0])*scaleX,ay=(a[1]-point[1])*scaleY,dx=(b[0]-a[0])*scaleX,dy=(b[1]-a[1])*scaleY;
    const fraction=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy||1))),distance=Math.hypot(ax+fraction*dx,ay+fraction*dy),progress=lengths[i]+fraction*(lengths[i+1]-lengths[i]);
    const score=distance+(Math.abs(progress-previous)>500?25:0);
    if(score<bestScore){bestScore=score;best={distance,progress,index:i,coordinate:[a[0]+fraction*(b[0]-a[0]),a[1]+fraction*(b[1]-a[1])]};}
  }return best;
}
const actions={0:'Teruskan',1:'Mula perjalanan',2:'Mula perjalanan',3:'Mula perjalanan',4:'Anda telah tiba',5:'Destinasi di sebelah kanan',6:'Destinasi di sebelah kiri',7:'Teruskan',8:'Kekal di kanan',9:'Belok sedikit ke kanan',10:'Belok kanan',11:'Belok tajam ke kanan',12:'Buat pusingan U',13:'Buat pusingan U',14:'Belok tajam ke kiri',15:'Belok kiri',16:'Belok sedikit ke kiri',17:'Kekal di kiri',18:'Ambil susur keluar kanan',19:'Ambil susur keluar kiri',20:'Ambil susur keluar',21:'Ambil susur keluar kanan',22:'Ambil susur keluar kiri',23:'Kekal di laluan',24:'Kekal di kanan',25:'Kekal di kiri',26:'Masuk ke laluan',27:'Masuk ke bulatan',28:'Keluar dari bulatan',29:'Naik feri',30:'Keluar dari feri'};
export function instruction(m){const action=actions[m.type]||m.instruction||'Ikut laluan';return action+(m.type===27&&m.roundabout_exit_count?`, ambil susur keluar ${m.roundabout_exit_count}`:'')+(m.street_names?.[0]?` ke ${m.street_names[0]}`:'');}
export function aheadReport(report,route,progress,lengths,point){const p=project([report.lon,report.lat],route,lengths,progress),ahead=p.progress-progress;return p.distance<40&&ahead>=0&&ahead<=1000&&meters(point,[report.lon,report.lat])<1100?ahead:null;}
