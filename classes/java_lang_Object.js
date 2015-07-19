(function(JVM) {
    JVM.RegisterBuiltIn("java/lang/Object", {
        '$impl': {
            'getClass$()Ljava/lang/Class;': function($) {
                return this.$class.class; // Return the Java Class implementation from our class
            },
            
            'toString$()Ljava/lang/String;': function($) {
                return $.jvm.createString(this.$class.$className + "@" + this.$id);
            },
            'hashCode$()I': function() {
                return this.$id;
            }
        }
    });
})(JVM);