(function(JVM) {
  JVM.RegisterBuiltIn("java/lang/Class", {
    '$impl': {
      '__': function($, impl) {
        console.error("Initializing class");
        console.dir(impl);

        var lastPos = impl.$javaName.lastIndexOf("/");
        Object.defineProperties(this.$prop, {
          _simpleName: {
            value: impl.$javaName.substring(lastPos+1)
          }
        });
        Object.defineProperties(this.$prop, {
          _name: {
            value: impl.$className
          }
        });
      },
      'getSimpleName$()Ljava/lang/String;': function($) {
        return $.jvm.createString(this.$prop._simpleName);
      },
      'getName$()Ljava/lang/String;': function($) {
        return $.jvm.createString(this.$prop._name);
      }
    }
  });
})(JVM);
