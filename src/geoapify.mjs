// Normalize Geoapify responses into the same route format as self-hosted Valhalla.
const types={None:0,StartAt:1,StartAtRight:2,StartAtLeft:3,DestinationReached:4,DestinationReachedRight:5,DestinationReachedLeft:6,Straight:7,SlightRight:9,Right:10,SharpRight:11,TurnAroundRight:12,TurnAroundLeft:13,SharpLeft:14,Left:15,SlightLeft:16,ExitRight:21,ExitLeft:22,StayRight:24,StayLeft:25,Merge:26,MergeRight:24,MergeLeft:25,Roundabout:27,FerryEnter:29,FerryExit:30};
export function geoRoutes(data){
  const trips=(data.features||[]).map(feature=>{
    const p=feature.properties;
    if(!Number.isFinite(p?.distance)||!Number.isFinite(p?.time)||!p.legs?.length)throw new Error('Respons laluan tidak sah.');
    return {status:0,summary:{time:p.time,length:p.distance/1000},legs:p.legs.map(leg=>{
      if(!leg.polyline6)throw new Error('Geometri laluan tiada.');
      return {shape:leg.polyline6,maneuvers:leg.steps.filter(s=>s.instruction).map(s=>({type:types[s.instruction.type]??0,begin_shape_index:s.from_index,end_shape_index:s.to_index,instruction:s.instruction.text,street_names:s.instruction.streets,roundabout_exit_count:s.instruction.roundabout_exit})),speedLimits:leg.steps.map(s=>({from:s.from_index,to:s.to_index,limit:typeof s.speed_limit==='number'&&s.speed_limit>0&&s.speed_limit<=160?s.speed_limit:null}))};
    })};
  });
  if(!trips.length)throw new Error('Laluan tidak dijumpai.');
  return {trip:trips[0],alternates:trips.slice(1).map(trip=>({trip}))};
}
export function geoPlaces(data){return {places:(data.results||[]).filter(p=>p.country_code==='my'&&/johor/i.test(p.state||'')).map(p=>({name:p.name||p.address_line1||p.formatted,address:p.formatted,coordinate:[p.lon,p.lat]}))};}
