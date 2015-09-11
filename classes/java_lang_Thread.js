(function(JVM) {
  JVM.RegisterBuiltIn("java/lang/Thread", {
    '$impl': {
      '<init>$()V': function() {
      },
      'holdsLock$(Ljava/lang/Object;)Z': function() {
        return false;
      }
    }
  });
})(JVM);



