const transactionModel=require("../models/transaction.model");
const ledgerModel=require("../models/ledger.model");
const emailService=require("../services/email.service");
const accountModel=require("../models/account.model");
const {pool}=require("../config/db");
const redLock=require("../config/redlock");
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validId=x=>typeof x==="string"&&UUID.test(x);
function existing(res,t){if(t.status==="COMPLETED")return res.status(200).json({message:"Payment Successful",transaction:t});if(t.status==="PENDING")return res.status(200).json({message:"Payment Pending/Processing"});if(t.status==="FAILED")return res.status(400).json({message:"Payment Failed"});return res.status(400).json({message:"Payment is Reversed, please retry"});}
async function createTransaction(req,res){
 const {fromAccount,toAccount,amount,idempotencyKey}=req.body;
 if(!fromAccount||!toAccount||amount===undefined||!idempotencyKey)return res.status(400).json({message:"please provide all details. fromAccount, toAccount, amount, idempotencyKey"});
 if(!validId(fromAccount)||!validId(toAccount))return res.status(400).json({message:"Invalid account ID"});
 if(typeof amount!=="number"||!Number.isFinite(amount)||amount<=0)return res.status(400).json({message:"Amount must be a positive number"});
 if(fromAccount===toAccount)return res.status(400).json({message:"Sender and receiver accounts must be different"});
 const old=await transactionModel.findOne({idempotencyKey});if(old)return existing(res,old);
 const sender=await accountModel.findOne({_id:fromAccount}),receiver=await accountModel.findOne({_id:toAccount});
 if(!sender)return res.status(400).json({message:"provide a valid sender account"});
 if(!receiver)return res.status(400).json({message:"provide a valid receiver account"});
 if(sender.status!=="ACTIVE"||receiver.status!=="ACTIVE")return res.status(403).json({message:"sender account and receiver account both should be Active"});
 const keys=[`account:${fromAccount}`,`account:${toAccount}`].sort();let lock,client;
 try{
  lock=await redLock.acquire(keys,10000);client=await pool.connect();await client.query("BEGIN");
  const s=await accountModel.findByIdForUpdate(fromAccount,client),r=await accountModel.findByIdForUpdate(toAccount,client);
  if(!s||!r)throw Error("ACCOUNT_NOT_FOUND");if(s.status!=="ACTIVE"||r.status!=="ACTIVE")throw Error("ACCOUNT_NOT_ACTIVE");
  if(await accountModel.getBalance(fromAccount,client)<amount)throw Error("INSUFFICIENT_BALANCE");
  const t=await transactionModel.create({fromAccount,toAccount,amount,idempotencyKey,status:"PENDING"},client);
  await ledgerModel.create({account:fromAccount,amount,transaction:t._id,type:"DEBIT"},client);
  await ledgerModel.create({account:toAccount,amount,transaction:t._id,type:"CREDIT"},client);
  const done=await transactionModel.updateStatus(t._id,"COMPLETED",client);await client.query("COMMIT");
  await emailService.sendTransactionEmail(req.user.email,req.user.name,amount,toAccount);
  return res.status(201).json({message:"Transaction completed successfully",transaction:done});
 }catch(e){if(client)try{await client.query("ROLLBACK")}catch(_){}if(e.code==="23505"){const t=await transactionModel.findOne({idempotencyKey});if(t)return existing(res,t);return res.status(409).json({message:"Payment is already processing"});}if(e.message==="INSUFFICIENT_BALANCE")return res.status(400).json({message:"Insufficient balance"});if(e.message==="ACCOUNT_NOT_FOUND")return res.status(404).json({message:"Account not found"});if(e.message==="ACCOUNT_NOT_ACTIVE")return res.status(403).json({message:"sender account and receiver account both should be Active"});if(e.name==="ExecutionError")return res.status(423).json({message:"Another transaction is already processing this account. Please retry."});console.error("Transaction error:",e);return res.status(400).json({message:"Transaction failed due to an issue"});}
 finally{if(client)client.release();if(lock)try{await lock.release()}catch(e){console.error("Failed to release Redis lock:",e.message);}}
}
async function createInitialFuncdstransaction(req,res){
 const {toAccount,amount,idempotencyKey}=req.body;if(!toAccount||amount===undefined||!idempotencyKey)return res.status(400).json({message:"please provide all details. - toAccount, amount, idempotencyKey"});if(!validId(toAccount)||typeof amount!=="number"||!Number.isFinite(amount)||amount<=0)return res.status(400).json({message:"Invalid account or amount"});
 const old=await transactionModel.findOne({idempotencyKey});if(old)return existing(res,old);
 const from=await accountModel.findOne({user:req.user._id}),to=await accountModel.findOne({_id:toAccount});if(!from)return res.status(400).json({message:"System User account not found"});if(!to)return res.status(400).json({message:"provide a valid receiver account"});
 const keys=[`account:${from._id}`,`account:${toAccount}`].sort();let lock,client;
 try{lock=await redLock.acquire(keys,10000);client=await pool.connect();await client.query("BEGIN");const t=await transactionModel.create({fromAccount:from._id,toAccount,amount,idempotencyKey,status:"PENDING"},client);await ledgerModel.create({account:from._id,amount,transaction:t._id,type:"DEBIT"},client);await ledgerModel.create({account:toAccount,amount,transaction:t._id,type:"CREDIT"},client);const done=await transactionModel.updateStatus(t._id,"COMPLETED",client);await client.query("COMMIT");return res.status(201).json({message:"Initial Funds Transaction completed successfully",transaction:done});}
 catch(e){if(client)try{await client.query("ROLLBACK")}catch(_){}if(e.code==="23505"){const t=await transactionModel.findOne({idempotencyKey});if(t)return existing(res,t)}return res.status(400).json({message:"Initial funds transaction failed"});}
 finally{if(client)client.release();if(lock)try{await lock.release()}catch(_){}}
}
module.exports={createTransaction,createInitialFuncdstransaction};