(function(JVM) {
    JVM.RegisterBuiltIn("java/lang/Class", {
        '$impl': {
            '__': function($, impl) {
                console.error("Initializing class");
                console.dir(impl);
                
                var lastPos = impl.$javaName.lastIndexOf("/");
                Object.defineProperties(this.$prop, {
                    _name: {
                        value: impl.$javaName.substring(lastPos+1)
                    }
                });
            },
            'getName$()Ljava/lang/String;': function($) {
                return this.$prop._name;
            }
        }
    });
})(JVM);