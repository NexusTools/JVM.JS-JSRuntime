(function(global) {
  var initMethod = /init\>$/;
  var method_name_parts = /^(.+)\$\((.*)\)(.+)$/;
  function defineUserSpace(impl, static, target) {
    var userMethods;
    var cache = "$userSpaceMethods" + static ? "Static" : "Local";
    if(!impl.hasOwnProperty(cache)) {
      //console.log("Gathering public " + (static ? "static" : "local") + " methods", impl.$javaName);

      var methods = {}, methodNames = [];
      var parent = impl;
      while(parent) {
        for(var key in parent.$impl) {
          var parts = key.match(method_name_parts);
          if(!parts)
            continue; // Skip non-java methods, internal use stuff
          if(initMethod.test(parts[1]) && (static || parent !== impl))
            continue; // Skip init methods for other classes and statics
          var funcName = "$" + parts[1];

          //console.log(key, funcName);
          var func = parent.$impl[key];
          if(!java_is_public(func))
            continue;

          if(java_is_static(func) != static)
            continue;

          var variants;
          if(!(funcName in methods)) {
            methodNames.push(parts[1]);
            variants = methods[funcName] = {};
          } else
            variants = methods[funcName];

          if(!(parts[2] in variants))
            variants[parts[2]] = func;
        }


        parent = parent.$super;
      }

      userMethods = {};
      //console.log("Detected methods", impl.$javaName, methodNames);
      methodNames.forEach(function(name) {
        var impls = methods['$' + name];
        var implSigs = Object.keys(impls);

        if(implSigs.length == 1) {
          var impl = impls[implSigs[0]];
          if(implSigs[0] == "")
            userMethods[name] = function basic_user_method_wrapper() {
              if(arguments.length > 0)
                throw new JavaErrors.IllegalArgumentException("This method expects no arguments.");

              return impl.call(this);
            };
        }
      });

      //console.log("Created user methods", userMethods);
      Object.defineProperty(impl, cache, {
        value: userMethods
      });
    } else
      userMethods = impl[cache];

    for(var key in userMethods)
      target[key] = userMethods[key].bind(target);
  }
  function createUserAccess(impl) {
    return function() {
      if("$class" in this)
        return;
      
      Object.defineProperty(this, '$class', {
        value: impl
      });

      defineUserSpace(impl, false, this);
    };
  }

  global.JavaClassLoader = function ClassLoader(jvm) {
    Object.defineProperty(this, "$jvm", {
      value: jvm
    });
    Object.defineProperty(this, "definedClasses", {
      value: {}
    });
    Object.defineProperty(this, "loadedClasses", {
      value: {}
    });
    Object.defineProperty(this, "nativeClasses", {
      value: {}
    });
    Object.defineProperty(this, "$classes", {
      value: {}
    });
  };
  JavaClassLoader.prototype.lookupImpl = function(obj, method) {
    if(obj == null)
      throw new JavaErrors.NullPointerException();

    var impl;
    if(impl = obj.$vcache[method])
      return impl;

    var parent = obj.$class;
    while(parent != null) {
      try {
        if(method in parent.$impl)
          return obj.$vcache[method] = parent.$impl[method];
      } catch(e) {}
      parent = parent.$super;
    }
    throw new JavaErrors.VirtualMachineError("Cannot resolve implementation for `" + method + "` of " + JSON.stringify(obj.$class));
  };
  JavaClassLoader.prototype.initImpl = function(name, friendlyName) {
    friendlyName = friendlyName || name.replace(/[^\w\$]/g, "_");

    var $self = this;
    var impl = eval("(function " + friendlyName + "() {this['<init>'].apply(this, arguments);})");
    Object.defineProperty(impl, "$javaName", {
      value: name
    });
    Object.defineProperty(impl, "$className", {
      value: name.replace(/\//g, ".")
    });
    Object.defineProperty(impl, "class", {
      configurable: true,
      get: function() {
        var classImpl = $self.loadClassImpl("java/lang/Class");
        var classInst = $self.$jvm.newObject();

        classImpl.$impl._.call(classInst);
        classImpl.$impl.__.call(classInst, impl);

        Object.defineProperty(impl, "class", {
          value: classInst
        });
        return classInst;
      }
    });
    impl.toString = function() {
      return name;
    };

    return impl;
  };
  JavaClassLoader.prototype.registerImpl = function(name, impl) {
    if(JVM.settings.verbose) {
      console.log("Registering Implementation");
      console.dir(impl);
    }

    impl.$method = function(method) {
      var found = impl.$impl[method];
      if(!found)
        throw new JavaErrors.VirtualMachineError("No such method `" + method + "` exists in `" + name + "`.");
      return found;
    };

    impl.$impl['_'] = createUserAccess(impl);
    if(impl.$impl.hasOwnProperty("<init>$()V")) {
      var _ = impl.$impl['_'];
      var init = impl.$method('<init>$()V');

      var jvm = this.$jvm;
      Object.defineProperty(impl, "$new", {
        value: function() {
          var object = jvm.newObject();
          _.call(object);
          init.call(object);
          return object;
        }
      });
    }



    var registry = this.$classes;
    var parts = name.split("/");
    //console.log("Registering", parts);

    var cname = parts.pop();
    parts.forEach(function(pkg) {
      if(!(pkg in registry))
        registry[pkg] = {};
      registry = registry[pkg];
    });
    registry[cname] = impl;
    this.loadedClasses[name] = impl;
  };
  JavaClassLoader.prototype.defineClass = function(name, interfaces, parent, impl) {
    if(name in this.loadedClasses)
      throw new JavaErrors.VirtualMachineError(name.replace(/\//g, '.') + " is already loaded.");
    if(name in this.definedClasses)
      throw new JavaErrors.VirtualMachineError(name.replace(/\//g, '.') + " is already defined.");

    if(JVM.settings.verbose)
      console.log("Defining class", name);
    this.definedClasses[name] = [interfaces, parent, impl];
  };

  JavaClassLoader.prototype.defineNativeImpl = function(name, impl) {
    if(!(name in this.definedClasses))
      throw new JavaErrors.ClassNotFoundException(name + " has not been defined.");
    if(name in this.nativeClasses)
      throw new JavaErrors.VirtualMachineError(name + " already has a native implementation.");

    if(JVM.settings.verbose)
      console.trace("Registering Native implementation", name, impl);

    this.nativeClasses[name] = impl;
    var loadedClass = this.loadedClasses[name];
    if(loadedClass)
      for(var key in impl)
        loadedClass.$native[key] = impl[key];
  };

  JavaClassLoader.prototype.loadClassImpl = function(name) {
    if(name in this.loadedClasses)
      return this.loadedClasses[name];

    var classID = name.replace(/\//g, '.');
    var builtIn = JVM.BuiltInClasses[name];
    if(builtIn) {
      var impl = this.initImpl(name);
      var $impl = builtIn;
      var imp = $impl['$impl'] || {};

      for(var key in imp) {
        (function(f) {
          imp[key] = function jvm_builtin_wrapper() {
            try {
              var args = Array.prototype.slice.call(arguments, 0);
              args.unshift({
                jvm: jvm,
                jclass: impl
              });

              return f.apply(this, args);
            } catch(e) {
              console.log(e.stack||e);
            }
          };
        })(imp[key]);
      }

      Object.defineProperty(impl, "$jvm", {
        value: this.jvm
      });
      Object.defineProperty(impl, "$impl", {
        value: imp
      });
      Object.defineProperty(impl, "$prop", {
        value: $impl['$prop'] || {}
      });

      var parentClass;
      if(name != "java/lang/Object") {

        if(JVM.settings.verbose)
          console.log(name, "Loading parent", $impl);
        parentClass = this.loadClassImpl($impl['$super'] || "java/lang/Object");
        if(parentClass == null)
          throw new JavaErrors.NullPointerException();

        if(JVM.settings.verbose)
          console.log(name, parentClass);

        Object.defineProperty(impl, "$super", {
          value: parentClass
        });
      }

      if(!imp.hasOwnProperty('<init>$()V')) {
        if(parentClass) // Skip upwards
          imp['<init>$()V'] = parentClass.$impl['<init>$()V'];
        else
          imp['<init>$()V'] = java_nop;
      }
      this.registerImpl(name, impl);
      return impl;
    }

    var classDefinition = this.definedClasses[name];
    if(!classDefinition)
      throw new JavaErrors.ClassNotFoundException(classID + " is not defined in this JVM instance.");

    if(JVM.settings.verbose)
      console.log("Loading class", name);

    var friendlyName;
    var impl = this.initImpl(name, friendlyName = name.replace(/[^\w\$]/g, "_"));
    var parentClass = this.loadClassImpl(classDefinition[1]);
    this.loadedClasses[name] = impl;

    var inits = [], $prop = {}, $impl = {};
    var $self = this;
    var $data = {
      self: $self,
      $prop: $prop,
      $impl: $impl,
      inits: inits,
      classID: classID,
      friendlyName: friendlyName,
      $nativeData: null,
      $native: null
    };
    var references = [];
    Object.defineProperty(impl, "$prop", {
      value: $prop
    });
    Object.defineProperty(impl, "$impl", {
      value: $impl
    });
    Object.defineProperty(impl, "$super", {
      value: parentClass
    });
    Object.defineProperty(impl, "$jvm", {
      value: this.$jvm
    });

    classDefinition[2].forEach(function(section) {
      switch(section.type) {
        case "references":
          references = section.value;
          break;

        case "method":
          JVM.CompileMethod(name, section, $data, impl);
          break;

        case "field":
          //if(section.access.indexOf(JVM.Flags.STATIC) > -1) {
          if(section.access.indexOf(JVM.Flags.FINAL) > -1) {
            if("numericValue" in section)
              Object.defineProperty($prop, section.name, {
                value: section.numericValue
              });
            else if("stringValue" in section)
              Object.defineProperty($prop, section.name, {
                value: section.stringValue
              });
            else
              $prop[section.name] = JVM.Flags.FINAL;
          } else
            $prop[section.name] = null;
          /* else {
                        if(section.access.indexOf(JVM.Flags.FINAL) > -1) {
                            if("numericValue" in section)
                                Object.defineProperty(impl.prototype, section.name, {
                                    value: section.numericValue
                                });
                            else if("stringValue" in section)
                                Object.defineProperty(impl.prototype, section.name, {
                                    value: section.stringValue
                                });
                            else
                                impl.prototype[section.name] = JVM.Flags.FINAL;
                        } else
                            console.error("Non final instance property: " + section.name);
                    }*/
          break;

        default:
          console.error("Unsupported type: " + section.type);
      }
    });

    this.registerImpl(name, impl);
    references.forEach(function(ref) {
      if(ref == name)
        return;

      $self.loadClassImpl(ref);
    });
    inits.forEach(function(init) {
      init();
    });

    if(JVM.settings.verbose)
      console.log("Compiled", name, impl);
    return impl;
  };
})(this);





