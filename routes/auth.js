import {Router} from 'express'
import jwt from 'jsonwebtoken';import {protect} from '../middleware/auth.js';import User from '../models/User.js'
const router=Router()
router.post('/login',async(req,res)=>{try{const{email,password}=req.body;if(!email||!password)return res.status(400).json({error:'Email and password required'});const user=await User.findOne({email:String(email).toLowerCase()}).select('+password');if(!user||user.status!=='active'||!(await user.comparePassword(password)))return res.status(401).json({error:'Invalid email or password'});const token=jwt.sign({id:user.userId,name:user.name,email:user.email,role:user.role},process.env.JWT_SECRET,{expiresIn:process.env.JWT_EXPIRES_IN||'8h'});const safe=user.toObject();delete safe.password;res.json({token,user:safe})}catch(e){res.status(500).json({error:e.message})}})
router.get('/me',protect,(req,res)=>res.json({user:req.user}))
export default router
