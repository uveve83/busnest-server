import {Router} from 'express';import {protect} from '../middleware/auth.js';import Location from '../models/Location.js';
const router=Router();router.use(protect)
router.get('/',async(req,res)=>res.json({data:await Location.find({active:true}).sort({type:1,name:1})}))
router.post('/',async(req,res)=>{try{const d=await Location.create(req.body);res.status(201).json({data:d})}catch(e){res.status(400).json({error:e.message})}})
router.put('/:id',async(req,res)=>{try{const d=await Location.findOneAndUpdate({$or:[{locationId:req.params.id},{_id:req.params.id}]},req.body,{new:true,runValidators:true});res.json({data:d})}catch(e){res.status(400).json({error:e.message})}})
router.delete('/:id',async(req,res)=>{await Location.findOneAndUpdate({$or:[{locationId:req.params.id},{_id:req.params.id}]},{active:false});res.json({message:'Location removed'})})
export default router
