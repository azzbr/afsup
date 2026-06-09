// Cloud Functions entrypoint. Each feature lives in its own file under src/
// and is re-exported here.

export { inviteUser } from "./inviteUser";
export { acceptInvite } from "./acceptInvite";
export { runScheduledTasks } from "./runScheduledTasks";
export { dailyComplianceScan } from "./dailyComplianceScan";
export { deleteUser, updateUserRole, updateUserStatus } from "./userMutations";
export { bootstrapSuperAdmin } from "./bootstrapSuperAdmin";
export { onTicketStatusChange } from "./onTicketStatusChange";
export { decideLeaveRequest } from "./decideLeaveRequest";
export { updateSchoolSettings } from "./updateSchoolSettings";
