(function(JVM) {
  JVM.RegisterBuiltIn("java/lang/Error", {
    '$impl': {
      '<init>$()V': function() {
        $.jclass.$super.$impl['<init>$()V'].call(this);
      },
      '<init>$(Ljava/lang/String;)V': function($, msg) {
        $.jclass.$super.$impl['<init>$(Ljava/lang/String;)V'].call(this, msg);
      },
      '<init>$(Ljava/lang/Throwable;)V': function($, cause) {
        $.jclass.$super.$impl['<init>$(Ljava/lang/Throwable;)V'].call(this, cause);
      },
      '<init>$(Ljava/lang/String;Ljava/lang/Throwable;)V': function($, msg, cause) {
        $.jclass.$super.$impl['<init>$(Ljava/lang/String;Ljava/lang/Throwable;)V'].call(this, msg, cause);
      }
    },
    '$super': 'java/lang/Throwable'
  });
})(JVM);
