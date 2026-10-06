//go:build darwin && cgo

package main

/*
#include <sys/acl.h>
#include <libproc.h>
#include <stdint.h>
#include <sys/stat.h>
#include <membership.h>
#include <uuid/uuid.h>
#include <errno.h>
#include <stdlib.h>
#include <string.h>
// Generic protected resources may have deny ACEs but never delegated allow ACEs.
static int protected_acl(int fd) {
 acl_t acl=acl_get_fd_np(fd,ACL_TYPE_EXTENDED); if(!acl)return errno==ENOENT?0:errno;
 acl_entry_t entry; int status=acl_get_entry(acl,ACL_FIRST_ENTRY,&entry);
 while(status==0) { acl_tag_t tag; if(acl_get_tag_type(entry,&tag)!=0){int e=errno;acl_free(acl);return e;}
  if(tag==ACL_EXTENDED_ALLOW){acl_free(acl);return EPERM;} status=acl_get_entry(acl,ACL_NEXT_ENTRY,&entry); }
 int e=(status==-1 && errno!=EINVAL)?errno:0;acl_free(acl);return e;
}
static int key_acl(int fd,uid_t uid,int set) {
 uuid_t identity;if(mbr_uid_to_uuid(uid,identity)!=0)return EINVAL;
 acl_t acl= set?acl_init(1):acl_get_fd_np(fd,ACL_TYPE_EXTENDED);if(!acl)return errno;
 acl_entry_t entry;acl_permset_t perms;acl_flagset_t flags;int error=0;
 if(set){
  if(acl_create_entry(&acl,&entry)||acl_set_tag_type(entry,ACL_EXTENDED_ALLOW)||acl_set_qualifier(entry,identity)||acl_get_permset(entry,&perms)||acl_clear_perms(perms)||acl_add_perm(perms,ACL_READ_DATA)||acl_set_permset(entry,perms)||acl_set_fd_np(fd,acl,ACL_TYPE_EXTENDED))error=errno;
 }else{
  if(acl_get_entry(acl,ACL_FIRST_ENTRY,&entry)!=0){error=EPERM;goto done;}
  acl_tag_t tag;void *qualifier=NULL;
  if(acl_get_tag_type(entry,&tag)||tag!=ACL_EXTENDED_ALLOW||(qualifier=acl_get_qualifier(entry))==NULL){error=EPERM;goto done;}
  int equal=memcmp(qualifier,identity,16)==0;acl_free(qualifier);
  if(!equal||acl_get_permset(entry,&perms)||acl_get_flagset_np(entry,&flags)||acl_get_perm_np(perms,ACL_READ_DATA)!=1){error=EPERM;goto done;}
  // Canonical native ACL text checks the entire ACE, including flags and all
  // current/future permission bits, rather than relying on opaque set layout.
  acl_t expected=acl_init(1);acl_entry_t wanted;acl_permset_t wp;
  if(!expected||acl_create_entry(&expected,&wanted)||acl_set_tag_type(wanted,ACL_EXTENDED_ALLOW)||acl_set_qualifier(wanted,identity)||acl_get_permset(wanted,&wp)||acl_clear_perms(wp)||acl_add_perm(wp,ACL_READ_DATA)||acl_set_permset(wanted,wp)){if(expected)acl_free(expected);error=EPERM;goto done;}
  char *actual_text=acl_to_text(acl,NULL),*expected_text=acl_to_text(expected,NULL);
  if(!actual_text||!expected_text||strcmp(actual_text,expected_text)!=0)error=EPERM;
  if(actual_text)acl_free(actual_text);if(expected_text)acl_free(expected_text);acl_free(expected);

 }
 done:acl_free(acl);return error;
}
static int copy_acl(int source,int target){
 acl_t acl=acl_get_fd_np(source,ACL_TYPE_EXTENDED);if(!acl){if(errno!=ENOENT)return errno;acl=acl_init(0);if(!acl)return errno;}
 int r=acl_set_fd_np(target,acl,ACL_TYPE_EXTENDED),e=r?errno:0;acl_free(acl);return e;
}
static int process_birth(int pid,uint64_t *seconds,uint64_t *micros){
 struct proc_bsdinfo info;int n=proc_pidinfo(pid,PROC_PIDTBSDINFO,0,&info,sizeof(info));if(n!=(int)sizeof(info))return errno?errno:ESRCH;*seconds=info.pbi_start_tvsec;*micros=info.pbi_start_tvusec;return 0;
}

*/
import "C"
import (
	"fmt"
	"os"
)

func nativeACLError(code C.int) error {
	if code != 0 {
		return fmt.Errorf("native macOS ACL operation failed: errno %d", int(code))
	}
	return nil
}
func validateProtectedACL(f *os.File) error { return nativeACLError(C.protected_acl(C.int(f.Fd()))) }
func setDarwinKeyACL(f *os.File, uid int) error {
	return nativeACLError(C.key_acl(C.int(f.Fd()), C.uid_t(uid), 1))
}
func checkDarwinKeyACL(f *os.File, uid int) error {
	return nativeACLError(C.key_acl(C.int(f.Fd()), C.uid_t(uid), 0))
}
func copyDarwinACL(source, target *os.File) error {
	return nativeACLError(C.copy_acl(C.int(source.Fd()), C.int(target.Fd())))
}

func nativeDarwinProcessBirth(pid int) (string, error) {
	var seconds, micros C.uint64_t
	code := C.process_birth(C.int(pid), &seconds, &micros)
	if code != 0 {
		return "", nativeACLError(code)
	}
	return fmt.Sprintf("%d.%06d", uint64(seconds), uint64(micros)), nil
}
