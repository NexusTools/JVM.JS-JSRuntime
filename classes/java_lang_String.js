(function(JVM) {
  JVM.RegisterBuiltIn("java/lang/String", {
    '$impl': {
      '<init>$()V': function() {
        Object.defineProperty(this.$prop, "_value", {
          value: value
        });
      },
      'hashCode$()I': function($) {
        //console.log("Calculating hash", this, $);
        var local = this.$prop;

        if (local.hasOwnProperty("_hash"))
          return local.hash;
        else {
          //console.log("Calculating hash for", local._value);

          var h = 0;
          for (var i = 0; i < local._value.length; i++)
            h = 31*h + local._value.charCodeAt(i);
          Object.defineProperty(local, "_hash", {
            value: h
          });
          return h;
        }
      },
      
      'getBytes$()[B': function($) {
        var bytes = [];
        var str = this.$prop._value;
        for(var i=0; i<str.length; i++)
          bytes[i] = str.charCodeAt(i);
        return bytes;
      },

      'valueOf$(I)Ljava/lang/String;': java_static_wrap(function($, val) {
        return $.jvm.createString(""+val);
      }),
      'valueOf$(D)Ljava/lang/String;': java_static_wrap(function($, val) {
        return $.jvm.createString(""+val);
      }),

      'length$()I': function($) {
        return this.$prop._value.length;
      },

      'toString$()Ljava/lang/String;': function($) {
        return this;
      }
    }
  });
})(JVM);


