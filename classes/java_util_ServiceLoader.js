(function(JVM) {
  JVM.RegisterBuiltIn("java/util/ServiceLoader", {
    '$impl': {
      'iterator$()Ljava/util/Iterator;': java_static_wrap(function($) {
        if(!$.itclass)
          $.itclass = $.jvm.ClassLoader.loadClassImpl("java/util/ServiceLoader$1");
        
        var target = this.$native._impl;
        var className = target.$class.$impl['getName$()Ljava/lang/String;'].call(target).$prop._value;
        console.log("iterator", className, this.$native);
        
        var obj = $.itclass.$new();
        var list = obj.$native._value = [];
        var services = $.jvm.ServiceMap[className];
        if(services)
          services.forEach(function(service) {
            list.push($.jvm.ClassLoader.loadClassImpl(service).$new());
          });
        
        console.log(className, $.jvm.ServiceMap, obj.$native._value);
        return obj;
      }),
      'load$(Ljava/lang/Class;)Ljava/util/ServiceLoader;': java_static_wrap(function($, clazz) {
        console.log("load(Ljava/lang/Class;)", JVM, $);
        
        var impl = $.jclass.$new();
        impl.$native._impl = clazz;
        
        console.log(impl);
        return impl;
      })
    },
    '$super': "java/lang/Iterator"
  });
  JVM.RegisterBuiltIn("java/util/ServiceLoader$1", {
    '$impl': {
      '<init>$()V': function() {
        console.warn("Initializing ServiceLoader$1");
        this.$native._pos = -1;
      },
      'hasNext$()Z': function($) {
        this.$native._pos++;
        return this.$native._pos < this.$native._value.length;
      },
      'next$()Ljava/lang/Object;': function() {
        return this.$native._value[this.$native._pos];
      }
    }
  });
})(JVM);

