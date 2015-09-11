(function(JVM) {
  JVM.RegisterBuiltIn("java/lang/CharSequence", {
    '$impl': {
      'length$()I': function($) {
        return this.$prop._value.length;
      },
      'toString$()Ljava/lang/String;': function($) {
        return this;
      }
    }
  });
})(JVM);


