(function(JVM) {
    JVM.RegisterBuiltIn("java/lang/Number", {
        '$impl': {
            'toString$()Ljava/lang/String;': function($) {
                return this;
            }
        }
    });
})(JVM);